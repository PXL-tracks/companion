import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ConnectionChildHandlerLegacy } from '../../../lib/Instance/Connection/ChildHandlerLegacy.js'
import { TimelineExecutor } from '../../../lib/Service/Timeline/Executor.js'
import { handlePxlIpcMessage } from '../../../lib/Service/Timeline/IpcBridge.js'

// PXL-tracks: the timeline sequencer relies on these to drive other connections at frame rate.
// An upstream merge already lost the IPC interception once without any conflict, these tests guard against that.

function createLogger(): any {
	return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), silly: vi.fn() }
}

function createExecutor(children: Record<string, { actionRun: (...args: any[]) => Promise<any> }>) {
	const instanceController: any = {
		processManager: {
			getConnectionChild: (connectionId: string) => children[connectionId],
		},
	}
	return new TimelineExecutor(createLogger(), instanceController)
}

afterEach(() => {
	delete (global as any).pxlCore
})

describe('TimelineExecutor', () => {
	test('wraps raw module options as non-expression values', async () => {
		const actionRun = vi.fn(async () => undefined)
		const executor = createExecutor({ obs: { actionRun } })

		const result = await executor.executeActions([
			{ connectionId: 'obs', actionId: 'set_volume', options: { volume: 50, source: 'Mic', muted: false } },
		])

		expect(result).toMatchObject({ success: true, count: 1, succeeded: 1, failed: 0 })
		expect(actionRun).toHaveBeenCalledTimes(1)
		const [action, extras] = actionRun.mock.calls[0] as any[]
		expect(action).toMatchObject({
			connectionId: 'obs',
			definitionId: 'set_volume',
			options: {
				volume: { value: 50, isExpression: false },
				source: { value: 'Mic', isExpression: false },
				muted: { value: false, isExpression: false },
			},
		})
		expect(extras.executionMode).toBe('concurrent')
	})

	test('counts actions for unknown connections as failed', async () => {
		const actionRun = vi.fn(async () => undefined)
		const executor = createExecutor({ obs: { actionRun } })

		const result = await executor.executeActions([
			{ connectionId: 'obs', actionId: 'a', options: {} },
			{ connectionId: 'missing', actionId: 'b', options: {} },
		])

		expect(result).toMatchObject({ count: 2, succeeded: 1, failed: 1 })
	})

	test('registers itself as the global executor', () => {
		createExecutor({})
		expect(typeof (global as any).pxlCore?.executeActions).toBe('function')
	})
})

describe('handlePxlIpcMessage', () => {
	test('ignores messages which are not for PXL', () => {
		const reply = vi.fn()
		expect(handlePxlIpcMessage({ direction: 'call', name: 'log-message' }, reply, createLogger())).toBe(false)
		expect(handlePxlIpcMessage(undefined, reply, createLogger())).toBe(false)
		expect(reply).not.toHaveBeenCalled()
	})

	test('runs a batch through the executor and replies with the result', async () => {
		const actionRun = vi.fn(async () => undefined)
		createExecutor({ obs: { actionRun } })
		const reply = vi.fn()

		const handled = handlePxlIpcMessage(
			{ _type: 'pxl-call', _id: 'tl_1', actions: [{ connectionId: 'obs', actionId: 'a', options: { x: 1 } }] },
			reply,
			createLogger()
		)

		expect(handled).toBe(true)
		await vi.waitFor(() => expect(reply).toHaveBeenCalled())
		expect(reply).toHaveBeenCalledWith({
			_replyTo: 'tl_1',
			success: true,
			result: expect.objectContaining({ success: true, count: 1, succeeded: 1 }),
		})
		expect(actionRun).toHaveBeenCalledTimes(1)
	})

	test('replies with an error when the executor is not registered', () => {
		const reply = vi.fn()

		handlePxlIpcMessage({ _type: 'pxl-call', _id: 'tl_2', actions: [] }, reply, createLogger())

		expect(reply).toHaveBeenCalledWith({
			_replyTo: 'tl_2',
			success: false,
			error: 'PXL Timeline Executor not registered',
		})
	})

	test('replies with an error when the executor throws', async () => {
		;(global as any).pxlCore = { executeActions: vi.fn(async () => Promise.reject(new Error('boom'))) }
		const reply = vi.fn()

		handlePxlIpcMessage({ _type: 'pxl-call', _id: 'tl_3', actions: [] }, reply, createLogger())

		await vi.waitFor(() => expect(reply).toHaveBeenCalled())
		expect(reply).toHaveBeenCalledWith({ _replyTo: 'tl_3', success: false, error: 'boom' })
	})

	test('rejects legacy method-based calls', () => {
		const reply = vi.fn()

		const handled = handlePxlIpcMessage(
			{ _type: 'pxl-call', _id: 'tl_4', method: 'pxlPeek', params: {} },
			reply,
			createLogger()
		)

		expect(handled).toBe(true)
		expect(reply).toHaveBeenCalledWith(expect.objectContaining({ _replyTo: 'tl_4', success: false }))
	})
})

describe('ConnectionChildHandlerLegacy', () => {
	test('intercepts pxl-call messages from the module process', async () => {
		const actionRun = vi.fn(async () => undefined)
		createExecutor({ obs: { actionRun } })

		const childSend = vi.fn()
		const monitor: any = new EventEmitter()
		monitor.child = { send: childSend }

		// The timeline sequencer module is built against module-base 1.13
		new ConnectionChildHandlerLegacy({ controls: {} } as any, monitor, 'pxl-timeline', '1.13.4', async () => {})

		monitor.emit('message', {
			_type: 'pxl-call',
			_id: 'tl_42',
			actions: [{ connectionId: 'obs', actionId: 'set_volume', options: { volume: 10 } }],
		})

		await vi.waitFor(() => expect(childSend).toHaveBeenCalled())
		expect(childSend).toHaveBeenCalledWith(expect.objectContaining({ _replyTo: 'tl_42', success: true }))
		expect(actionRun).toHaveBeenCalledTimes(1)
	})
})
