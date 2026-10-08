import type { InstanceController } from '../../Instance/Controller.js'
import LogController, { type Logger } from '../../Log/Controller.js'
import { TimelineExecutor } from './Executor.js'

export class ServiceTimeline {
	readonly #logger: Logger
	readonly #executor: TimelineExecutor

	constructor(instanceController: InstanceController) {
		this.#logger = LogController.createLogger('Service/Timeline')
		this.#executor = new TimelineExecutor(this.#logger, instanceController)
	}

	getStatus(): ReturnType<TimelineExecutor['getStatus']> {
		return this.#executor.getStatus()
	}
}
