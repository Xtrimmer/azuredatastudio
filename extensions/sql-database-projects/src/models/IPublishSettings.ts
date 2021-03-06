/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IPublishSettings {
	databaseName: string;
	connectionUri: string;
	upgradeExisting: boolean;
	sqlCmdVariables?: Record<string, string>;
}

export interface IGenerateScriptSettings {
	databaseName: string;
	connectionUri: string;
	sqlCmdVariables?: Record<string, string>;
}

// only reading db name and SQLCMD vars from profile for now
export interface PublishProfile {
	databaseName: string;
	sqlCmdVariables: Record<string, string>;
}
