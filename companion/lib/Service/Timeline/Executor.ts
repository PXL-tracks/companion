import { nanoid } from 'nanoid'
import { EntityModelType, type ActionEntityModel } from '@companion-app/shared/Model/EntityModel.js'
import { optionsObjectToExpressionOptions } from '@companion-app/shared/Model/Options.js'
import type { InstanceController } from '../../Instance/Controller.js'
import type { Logger } from '../../Log/Controller.js'

export interface TimelineAction {
	connectionId: string
	actionId: string
	options: Record<string, any>
}

interface ExecuteResult {
	success: boolean
	count: number
	elapsed?: number
	succeeded?: number
	failed?: number
}

export class TimelineExecutor {
	readonly #logger: Logger
	readonly #instanceController: InstanceController

	constructor(logger: Logger, instanceController: InstanceController) {
		this.#logger = logger
		this.#instanceController = instanceController
		;(global as any).pxlCore = {
			executeActions: this.executeActions.bind(this),
		}

		const cleanup = () => {
			if ((global as any).pxlCore) {
				delete (global as any).pxlCore
			}
		}

		process.on('exit', cleanup)
		process.on('SIGINT', cleanup)
		process.on('SIGTERM', cleanup)
	}

	async executeActions(actions: TimelineAction[]): Promise<ExecuteResult> {
		if (!actions || actions.length === 0) {
			return { success: true, count: 0 }
		}

		const startTime = Date.now()

		const results = await Promise.allSettled(
			actions.map(async (action) => {
				const { connectionId, actionId, options } = action

				const actionEntity: ActionEntityModel = {
					type: EntityModelType.Action,
					id: nanoid(),
					connectionId: connectionId,
					definitionId: actionId,
					options: optionsObjectToExpressionOptions(options || {}, false),
					upgradeIndex: undefined,
				}

				const extras = {
					controlId: 'pxl-timeline',
					surfaceId: undefined,
					location: undefined,
					abortDelayed: new AbortController().signal,
					executionMode: 'concurrent' as const,
				}

				const child = this.#instanceController.processManager.getConnectionChild(connectionId)
				if (!child) {
					throw new Error(`Connection ${connectionId} not found`)
				}
				await child.actionRun(actionEntity, extras)

				return { success: true }
			})
		)

		const elapsed = Date.now() - startTime
		const succeeded = results.filter((r) => r.status === 'fulfilled').length
		const failed = results.filter((r) => r.status === 'rejected').length

		this.#logger.debug(`Executed ${actions.length} actions in ${elapsed}ms (${succeeded} ok, ${failed} fail)`)

		return {
			success: true,
			count: actions.length,
			elapsed: elapsed,
			succeeded: succeeded,
			failed: failed,
		}
	}

	getStatus(): { ready: boolean; registered: boolean; method: string } {
		return {
			ready: true,
			registered: !!(global as any).pxlCore,
			method: 'direct-processManager',
		}
	}
}
