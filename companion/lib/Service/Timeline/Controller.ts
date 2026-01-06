import type { InstanceController } from '../../Instance/Controller.js'
import LogController, { type Logger } from '../../Log/Controller.js'
import { TimelineExecutor } from './Executor.js'

/**
 * Service providing ultra-fast direct execution for PXL Timeline Sequencer.
 * Registers a global executor that bypasses tRPC for frame-accurate control.
 *
 * @author Eliott Paris / DeeJayMX
 * @since 3.5.0
 * @copyright 2025 PixelMasters
 * @license
 * This program is free software.
 * You should have received a copy of the MIT licence as well as the Bitfocus
 * Individual Contributor License Agreement for Companion along with
 * this program.
 */
export class ServiceTimeline {
	readonly #logger: Logger
	readonly #executor: TimelineExecutor

	constructor(instanceController: InstanceController) {
		this.#logger = LogController.createLogger('Service/Timeline')
		
		this.#logger.info('🚀 Initializing PXL Timeline Direct Executor...')
		
		// Create executor with access to processManager
		this.#executor = new TimelineExecutor(this.#logger, instanceController)
		
		this.#logger.info('✅ PXL Timeline Direct Executor ready')
		this.#logger.info('   Method: direct processManager')
		this.#logger.info('   Latency: < 1ms batch execution')
	}

	/**
	 * Get current status
	 */
	getStatus() {
		return this.#executor.getStatus()
	}
}
