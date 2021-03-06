/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import ControllerBase from './controllers/controllerBase';
import MainController from './controllers/mainController';
import { ApiWrapper } from './common/apiWrapper';

let controllers: ControllerBase[] = [];

export async function activate(context: vscode.ExtensionContext): Promise<void> {

	let apiWrapper = new ApiWrapper();

	// Start the main controller
	let mainController = new MainController(context, apiWrapper);
	controllers.push(mainController);
	context.subscriptions.push(mainController);

	await mainController.activate();
}

export function deactivate() {
	for (let controller of controllers) {
		controller.deactivate();
	}
}
