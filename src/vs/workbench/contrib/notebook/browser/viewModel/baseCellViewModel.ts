/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { IPosition } from 'vs/editor/common/core/position';
import * as editorCommon from 'vs/editor/common/editorCommon';
import * as model from 'vs/editor/common/model';
import { SearchParams } from 'vs/editor/common/model/textModelSearch';
import { EDITOR_TOP_PADDING } from 'vs/workbench/contrib/notebook/browser/constants';
import { CellEditState, CellFocusMode, CursorAtBoundary, CellViewModelStateChangeEvent, IEditableCellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellKind, NotebookCellMetadata, NotebookDocumentMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';

export abstract class BaseCellViewModel extends Disposable {
	protected readonly _onDidChangeEditorAttachState = new Emitter<void>();
	// Do not merge this event with `onDidChangeState` as we are using `Event.once(onDidChangeEditorAttachState)` elsewhere.
	readonly onDidChangeEditorAttachState = this._onDidChangeEditorAttachState.event;
	protected readonly _onDidChangeState: Emitter<CellViewModelStateChangeEvent> = this._register(new Emitter<CellViewModelStateChangeEvent>());
	public readonly onDidChangeState: Event<CellViewModelStateChangeEvent> = this._onDidChangeState.event;

	get handle() {
		return this.model.handle;
	}
	get uri() {
		return this.model.uri;
	}
	get lineCount() {
		return this.model.textBuffer.getLineCount();
	}
	get metadata() {
		return this.model.metadata;
	}
	get language() {
		return this.model.language;
	}

	abstract cellKind: CellKind;

	private _editState: CellEditState = CellEditState.Preview;

	get editState(): CellEditState {
		return this._editState;
	}

	set editState(newState: CellEditState) {
		if (newState === this._editState) {
			return;
		}

		this._editState = newState;
		this._onDidChangeState.fire({ editStateChanged: true });
		if (this._editState === CellEditState.Preview) {
			this.focusMode = CellFocusMode.Container;
		}
	}

	private _currentTokenSource: CancellationTokenSource | undefined;
	public set currentTokenSource(v: CancellationTokenSource | undefined) {
		this._currentTokenSource = v;
	}

	public get currentTokenSource(): CancellationTokenSource | undefined {
		return this._currentTokenSource;
	}

	private _focusMode: CellFocusMode = CellFocusMode.Container;
	get focusMode() {
		return this._focusMode;
	}
	set focusMode(newMode: CellFocusMode) {
		this._focusMode = newMode;
		this._onDidChangeState.fire({ focusModeChanged: true });
	}

	protected _textEditor?: ICodeEditor;
	get editorAttached(): boolean {
		return !!this._textEditor;
	}
	private _cursorChangeListener: IDisposable | null = null;
	private _editorViewStates: editorCommon.ICodeEditorViewState | null = null;
	private _resolvedDecorations = new Map<string, {
		id?: string;
		options: model.IModelDeltaDecoration;
	}>();
	private _lastDecorationId: number = 0;

	get textModel(): model.ITextModel | undefined {
		return this.model.textModel;
	}

	set textModel(m: model.ITextModel | undefined) {
		this.model.textModel = m;
	}

	hasModel(): this is IEditableCellViewModel {
		return !!this.model.textModel;
	}

	private _dragging: boolean = false;
	get dragging(): boolean {
		return this._dragging;
	}

	set dragging(v: boolean) {
		this._dragging = v;
	}

	constructor(readonly viewType: string, readonly model: NotebookCellTextModel, public id: string) {
		super();

		this._register(model.onDidChangeLanguage(() => {
			this._onDidChangeState.fire({ languageChanged: true });
		}));

		this._register(model.onDidChangeMetadata(() => {
			this._onDidChangeState.fire({ metadataChanged: true });
		}));
	}

	// abstract resolveTextModel(): Promise<model.ITextModel>;
	abstract hasDynamicHeight(): boolean;
	abstract getHeight(lineHeight: number): number;
	abstract onDeselect(): void;

	assertTextModelAttached(): boolean {
		if (this.textModel && this._textEditor && this._textEditor.getModel() === this.textModel) {
			return true;
		}

		return false;
	}

	attachTextEditor(editor: ICodeEditor) {
		if (!editor.hasModel()) {
			throw new Error('Invalid editor: model is missing');
		}

		if (this._textEditor === editor) {
			if (this._cursorChangeListener === null) {
				this._cursorChangeListener = this._textEditor.onDidChangeCursorSelection(() => { this._onDidChangeState.fire({ selectionChanged: true }); });
				this._onDidChangeState.fire({ selectionChanged: true });
			}
			return;
		}

		this._textEditor = editor;
		this.textModel = this._textEditor.getModel() || undefined;

		if (this._editorViewStates) {
			this._restoreViewState(this._editorViewStates);
		}

		this._resolvedDecorations.forEach((value, key) => {
			if (key.startsWith('_lazy_')) {
				// lazy ones
				const ret = this._textEditor!.deltaDecorations([], [value.options]);
				this._resolvedDecorations.get(key)!.id = ret[0];
			}
			else {
				const ret = this._textEditor!.deltaDecorations([], [value.options]);
				this._resolvedDecorations.get(key)!.id = ret[0];
			}
		});

		this._cursorChangeListener = this._textEditor.onDidChangeCursorSelection(() => { this._onDidChangeState.fire({ selectionChanged: true }); });
		this._onDidChangeState.fire({ selectionChanged: true });
		this._onDidChangeEditorAttachState.fire();
	}

	detachTextEditor() {
		this.saveViewState();
		// decorations need to be cleared first as editors can be resued.
		this._resolvedDecorations.forEach(value => {
			let resolvedid = value.id;

			if (resolvedid) {
				this._textEditor?.deltaDecorations([resolvedid], []);
			}
		});

		this._textEditor = undefined;
		this.textModel = undefined;
		this._cursorChangeListener?.dispose();
		this._cursorChangeListener = null;
		this._onDidChangeEditorAttachState.fire();
	}

	getText(): string {
		return this.model.getValue();
	}

	getTextLength(): number {
		return this.model.getTextLength();
	}

	private saveViewState(): void {
		if (!this._textEditor) {
			return;
		}

		this._editorViewStates = this._textEditor.saveViewState();
	}

	saveEditorViewState() {
		if (this._textEditor) {
			this._editorViewStates = this._textEditor.saveViewState();
		}

		return this._editorViewStates;
	}

	restoreEditorViewState(editorViewStates: editorCommon.ICodeEditorViewState | null, totalHeight?: number) {
		this._editorViewStates = editorViewStates;
	}

	private _restoreViewState(state: editorCommon.ICodeEditorViewState | null): void {
		if (state) {
			this._textEditor?.restoreViewState(state);
		}
	}

	addDecoration(decoration: model.IModelDeltaDecoration): string {
		if (!this._textEditor) {
			const id = ++this._lastDecorationId;
			const decorationId = `_lazy_${this.id};${id}`;
			this._resolvedDecorations.set(decorationId, { options: decoration });
			return decorationId;
		}

		const result = this._textEditor.deltaDecorations([], [decoration]);
		this._resolvedDecorations.set(result[0], { id: result[0], options: decoration });
		return result[0];
	}

	removeDecoration(decorationId: string) {
		const realDecorationId = this._resolvedDecorations.get(decorationId);

		if (this._textEditor && realDecorationId && realDecorationId.id !== undefined) {
			this._textEditor.deltaDecorations([realDecorationId.id!], []);
		}

		// lastly, remove all the cache
		this._resolvedDecorations.delete(decorationId);
	}

	deltaDecorations(oldDecorations: string[], newDecorations: model.IModelDeltaDecoration[]): string[] {
		oldDecorations.forEach(id => {
			this.removeDecoration(id);
		});

		const ret = newDecorations.map(option => {
			return this.addDecoration(option);
		});

		return ret;
	}

	revealRangeInCenter(range: Range) {
		this._textEditor?.revealRangeInCenter(range, editorCommon.ScrollType.Immediate);
	}

	setSelection(range: Range) {
		this._textEditor?.setSelection(range);
	}

	setSelections(selections: Selection[]) {
		this._textEditor?.setSelections(selections);
	}

	getSelections() {
		return this._textEditor?.getSelections() || [];
	}

	getSelectionsStartPosition(): IPosition[] | undefined {
		if (this._textEditor) {
			const selections = this._textEditor.getSelections();
			return selections?.map(s => s.getStartPosition());
		} else {
			const selections = this._editorViewStates?.cursorState;
			return selections?.map(s => s.selectionStart);
		}
	}

	getLineScrollTopOffset(line: number): number {
		if (!this._textEditor) {
			return 0;
		}

		return this._textEditor.getTopForLineNumber(line) + EDITOR_TOP_PADDING;
	}

	getPositionScrollTopOffset(line: number, column: number): number {
		if (!this._textEditor) {
			return 0;
		}

		return this._textEditor.getTopForPosition(line, column) + EDITOR_TOP_PADDING;
	}

	cursorAtBoundary(): CursorAtBoundary {
		if (!this._textEditor) {
			return CursorAtBoundary.None;
		}

		if (!this.textModel) {
			return CursorAtBoundary.None;
		}

		// only validate primary cursor
		const selection = this._textEditor.getSelection();

		// only validate empty cursor
		if (!selection || !selection.isEmpty()) {
			return CursorAtBoundary.None;
		}

		const firstViewLineTop = this._textEditor.getTopForPosition(1, 1);
		const lastViewLineTop = this._textEditor.getTopForPosition(this.textModel!.getLineCount(), this.textModel!.getLineLength(this.textModel!.getLineCount()));
		const selectionTop = this._textEditor.getTopForPosition(selection.startLineNumber, selection.startColumn);

		if (selectionTop === lastViewLineTop) {
			if (selectionTop === firstViewLineTop) {
				return CursorAtBoundary.Both;
			} else {
				return CursorAtBoundary.Bottom;
			}
		} else {
			if (selectionTop === firstViewLineTop) {
				return CursorAtBoundary.Top;
			} else {
				return CursorAtBoundary.None;
			}
		}
	}

	get textBuffer() {
		return this.model.textBuffer;
	}

	abstract resolveTextModel(): Promise<model.ITextModel>;

	protected cellStartFind(value: string): model.FindMatch[] | null {
		let cellMatches: model.FindMatch[] = [];

		if (this.assertTextModelAttached()) {
			cellMatches = this.textModel!.findMatches(value, false, false, false, null, false);
		} else {
			const lineCount = this.textBuffer.getLineCount();
			const fullRange = new Range(1, 1, lineCount, this.textBuffer.getLineLength(lineCount) + 1);
			const searchParams = new SearchParams(value, false, false, null);
			const searchData = searchParams.parseSearchRequest();

			if (!searchData) {
				return null;
			}

			cellMatches = this.textBuffer.findMatchesLineByLine(fullRange, searchData, false, 1000);
		}

		return cellMatches;
	}

	getEvaluatedMetadata(documentMetadata: NotebookDocumentMetadata): NotebookCellMetadata {
		const editable = this.metadata?.editable ??
			documentMetadata.cellEditable;

		const runnable = this.metadata?.runnable ??
			documentMetadata.cellRunnable;

		const hasExecutionOrder = this.metadata?.hasExecutionOrder ??
			documentMetadata.cellHasExecutionOrder;

		return {
			...(this.metadata || {}),
			...{
				editable,
				runnable,
				hasExecutionOrder
			}
		};
	}

	dispose() {
		super.dispose();
	}

	toJSON(): object {
		return {
			handle: this.handle
		};
	}
}
