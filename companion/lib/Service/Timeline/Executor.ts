import { nanoid } from 'nanoid'
import type { Logger } from '../../Log/Controller.js'
import type { InstanceController } from '../../Instance/Controller.js'
import { EntityModelType, type ActionEntityModel } from '@companion-app/shared/Model/EntityModel.js'

/**
 * PXL Timeline Sequencer - Direct Executor
 * Ultra-fast direct access to processManager for frame-accurate control
 * 
 * @author Eliott Paris / DeeJayMX
 * @since 3.5.0
 * @copyright 2025 PixelMasters
 */

interface TimelineAction {
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
		
		// Register global executor for IPC access
		;(global as any).pxlTimelineExecutor = {
			executeActions: this.executeActions.bind(this)
		}
		
		// Cleanup on exit
		const cleanup = () => {
			if ((global as any).pxlTimelineExecutor) {
				delete (global as any).pxlTimelineExecutor
				this.#logger.info('🧹 PXL Timeline Direct Executor - Cleaned up')
			}
		}
		
		process.on('exit', cleanup)
		process.on('SIGINT', cleanup)
		process.on('SIGTERM', cleanup)
	}

	/**
	 * Execute multiple actions in parallel (batch from one tick)
	 * NOTE: Internal actions (custom variables) are NOT handled here
	 * They continue using the existing optimized path
	 */
	async executeActions(actions: TimelineAction[]): Promise<ExecuteResult> {
		if (!actions || actions.length === 0) {
			return { success: true, count: 0 }
		}

		const startTime = Date.now()

		// Execute all actions in parallel
		const results = await Promise.allSettled(
			actions.map(async (action) => {
				const { connectionId, actionId, options } = action

				// Build action entity
				const actionEntity: ActionEntityModel = {
					type: EntityModelType.Action,
					id: nanoid(),
					connectionId: connectionId,
					definitionId: actionId,
					options: options || {},
					upgradeIndex: undefined
				}

				// Build extras
				const extras = {
					controlId: 'pxl-timeline',
					surfaceId: undefined,
					location: undefined,
					abortDelayed: new AbortController().signal,
					executionMode: 'concurrent' as const
				}

				// Execute via processManager DIRECT
				const child = this.#instanceController.processManager.getConnectionChild(connectionId)
				if (!child) {
					throw new Error(`Connection ${connectionId} not found`)
				}
				await child.actionRun(actionEntity, extras)

				return { success: true }
			})
		)

		const elapsed = Date.now() - startTime
		const succeeded = results.filter(r => r.status === 'fulfilled').length
		const failed = results.filter(r => r.status === 'rejected').length

		this.#logger.debug(`⚡ Executed ${actions.length} actions in ${elapsed}ms (${succeeded} ok, ${failed} fail)`)

		return {
			success: true,
			count: actions.length,
			elapsed: elapsed,
			succeeded: succeeded,
			failed: failed
		}
	}

	/**
	 * Get executor status
	 */
	getStatus(): { ready: boolean; registered: boolean; method: string } {
		return {
			ready: true,
			registered: !!(global as any).pxlTimelineExecutor,
			method: 'direct-processManager'
		}
	}
}
