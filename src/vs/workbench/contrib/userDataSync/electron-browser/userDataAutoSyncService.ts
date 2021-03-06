/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataAutoSyncService, UserDataSyncError } from 'vs/platform/userDataSync/common/userDataSync';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { Event } from 'vs/base/common/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { UserDataSyncTrigger } from 'vs/workbench/contrib/userDataSync/browser/userDataSyncTrigger';
import { UserDataAutoSyncEnablementService } from 'vs/platform/userDataSync/common/userDataAutoSyncService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export class UserDataAutoSyncService extends UserDataAutoSyncEnablementService implements IUserDataAutoSyncService {

	declare readonly _serviceBrand: undefined;

	private readonly channel: IChannel;
	get onTurnOnSync(): Event<void> { return this.channel.listen<void>('onTurnOnSync'); }
	get onDidTurnOnSync(): Event<UserDataSyncError | undefined> { return Event.map(this.channel.listen<Error | undefined>('onDidTurnOnSync'), e => e ? UserDataSyncError.toUserDataSyncError(e) : undefined); }
	get onError(): Event<UserDataSyncError> { return Event.map(this.channel.listen<Error>('onError'), e => UserDataSyncError.toUserDataSyncError(e)); }

	constructor(
		@IStorageService storageService: IStorageService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISharedProcessService sharedProcessService: ISharedProcessService,
	) {
		super(storageService, environmentService);
		this.channel = sharedProcessService.getChannel('userDataAutoSync');
		this._register(instantiationService.createInstance(UserDataSyncTrigger).onDidTriggerSync(source => this.triggerSync([source], true)));
	}

	triggerSync(sources: string[], hasToLimitSync: boolean): Promise<void> {
		return this.channel.call('triggerSync', [sources, hasToLimitSync]);
	}

	turnOn(pullFirst: boolean): Promise<void> {
		return this.channel.call('turnOn', [pullFirst]);
	}

	turnOff(everywhere: boolean): Promise<void> {
		return this.channel.call('turnOff', [everywhere]);
	}

}
