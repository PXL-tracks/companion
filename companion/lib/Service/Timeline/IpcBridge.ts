import type { Logger } from '../../Log/Controller.js'
import type { TimelineAction } from './Executor.js'

interface PxlCallMessage {
	_type?: string
	_id?: string
	actions?: TimelineAction[]
}

/**
 * PXL-tracks - IPC fast path for the Timeline Sequencer.
 *
 * The timeline module sends one batch of actions per tick with process.send():
 *   { _type: 'pxl-call', _id: 'tl_123', actions: [{ connectionId, actionId, options }] }
 * This runs them through the global executor (see Executor.ts), bypassing tRPC, and replies with
 *   { _replyTo: 'tl_123', success, result | error }
 *
 * Kept outside the ChildHandler so that the core patch is a single call, which survives upstream refactors.
 *
 * @returns true if the message was a PXL message and has been handled
 */
export function handlePxlIpcMessage(rawMsg: unknown, reply: (msg: unknown) => void, logger: Logger): boolean {
	const msg = rawMsg as PxlCallMessage | undefined
	if (!msg || msg._type !== 'pxl-call') return false

	const replyId = msg._id

	if (!Array.isArray(msg.actions)) {
		// Legacy method-based calls (pxlSniff, pxlPeek...) are served over tRPC instead
		logger.debug(`Timeline Sequencer: Rejecting legacy method-based call, use tRPC instead`)
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
		logger.error(`Timeline Sequencer batch execution failed: PXL Timeline Executor not registered`)
		if (replyId) reply({ _replyTo: replyId, success: false, error: 'PXL Timeline Executor not registered' })
		return true
	}

	Promise.resolve(pxlCore.executeActions(msg.actions)).then(
		(result) => {
			if (replyId) reply({ _replyTo: replyId, success: true, result: result })
		},
		(err) => {
			logger.error(`Timeline Sequencer batch execution failed: ${err?.message ?? err}`)
			if (replyId) reply({ _replyTo: replyId, success: false, error: err?.message ?? String(err) })
		}
	)

	return true
}
