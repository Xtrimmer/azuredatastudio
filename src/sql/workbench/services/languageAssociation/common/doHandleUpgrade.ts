/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from 'vs/workbench/common/editor';
import { UntitledTextEditorInput } from 'vs/workbench/common/editor/untitledTextEditorInput';
import { FileEditorInput } from 'vs/workbench/contrib/files/common/editors/fileEditorInput';
import { Extensions as ILanguageAssociationExtensions, ILanguageAssociationRegistry } from 'sql/workbench/services/languageAssociation/common/languageAssociation';
import { Registry } from 'vs/platform/registry/common/platform';

const languageRegistry = Registry.as<ILanguageAssociationRegistry>(ILanguageAssociationExtensions.LanguageAssociations);

export function doHandleUpgrade(editor?: EditorInput): EditorInput | undefined {
	if (editor instanceof UntitledTextEditorInput || editor instanceof FileEditorInput) {
		let language: string;
		if (editor instanceof UntitledTextEditorInput) {
			language = editor.getMode();
		} else {
			editor.getPreferredMode();
		}
		const association = languageRegistry.getAssociationForLanguage(language);
		if (association) {
			return association.convertInput(editor);
		}
	}
	return editor;
}
