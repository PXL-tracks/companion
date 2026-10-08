import type { Logger } from '../../Log/Controller.js'
import type { TimelineAction } from './Executor.js'

interface PxlCallMessage {
	_type?: string
	_id?: string
	actions?: TimelineAction[]
}

export function handlePxlIpcMessage(rawMsg: unknown, reply: (msg: unknown) => void, logger: Logger): boolean {
	const msg = rawMsg as PxlCallMessage | undefined
	if (!msg || msg._type !== 'pxl-call') return false

	const replyId = msg._id

	if (!Array.isArray(msg.actions)) {
		logger.debug(`Rejecting method-based call`)
		if (replyId) {
			reply({
				_replyTo: replyId,
				success: false,
				error: 'Method-based calls not supported. Use tRPC for metadata queries.',
			})
		}
		return true
	}

	const pxlCore = (global as any).pxlCore
	if (!pxlCore) {
		logger.error(`Batch execution failed: executor not registered`)
		if (replyId) reply({ _replyTo: replyId, success: false, error: 'Executor not registered' })
		return true
	}

	Promise.resolve(pxlCore.executeActions(msg.actions)).then(
		(result) => {
			if (replyId) reply({ _replyTo: replyId, success: true, result: result })
		},
		(err) => {
			logger.error(`Batch execution failed: ${err?.message ?? err}`)
			if (replyId) reply({ _replyTo: replyId, success: false, error: err?.message ?? String(err) })
		}
	)

	return true
}
