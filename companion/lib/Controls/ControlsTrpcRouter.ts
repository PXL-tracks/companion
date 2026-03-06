import { publicProcedure } from '../UI/TRPC.js'
import type { SomeControl } from './IControlFragments.js'
import z from 'zod'
import { zodLocation } from '../Preview/Graphics.js'
import type { InstanceDefinitions } from '../Instance/Definitions.js'
import type { ControlsController } from './Controller.js'
import type { IPageStore } from '../Page/Store.js'
import { CreateBankControlId, formatLocation } from '@companion-app/shared/ControlId.js'
import { nanoid } from 'nanoid'
import type { Logger } from '../Log/Controller.js'
import type { ControlCommonEvents } from './ControlDependencies.js'
import type EventEmitter from 'node:events'
import { JsonValueSchema, type ExpressionableOptionsObject } from '@companion-app/shared/Model/Options.js'
import { EntityModelType, type ActionEntityModel, type FeedbackEntityModel } from '@companion-app/shared/Model/EntityModel.js'
import type { RunActionExtras } from '../Instance/Connection/ChildHandlerApi.js'
import type { InstanceProcessManager } from '../Instance/ProcessManager.js'

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createControlsTrpcRouter(
	logger: Logger,
	controlsMap: Map<string, SomeControl<any>>,
	pageStore: IPageStore,
	instanceDefinitions: InstanceDefinitions,
	controlEvents: EventEmitter<ControlCommonEvents>,
	controlsController: ControlsController,
	processManager: InstanceProcessManager
) {
	return {
		importPreset: publicProcedure
			.input(
				z.object({
					connectionId: z.string(),
					presetId: z.string(),
					location: zodLocation,
					variableValues: z.record(z.string(), JsonValueSchema.optional()).nullable(),
				})
			)
			.mutation(async ({ input }) => {
				const model = instanceDefinitions.convertPresetToControlModel(
					input.connectionId,
					input.presetId,
					input.variableValues
				)
				if (!model) return null

				return controlsController.importControl(input.location, model)
			}),

		resetControl: publicProcedure
			.input(
				z.object({
					location: zodLocation,
					newType: z.string().optional(),
				})
			)
			.mutation(async ({ input }) => {
				const { location, newType } = input

				const controlId = pageStore.getControlIdAt(location)

				if (controlId) {
					controlsController.deleteControl(controlId)
				}

				if (newType) {
					controlsController.createButtonControl(location, newType)
				}
			}),

		moveControl: publicProcedure
			.input(
				z.object({
					fromLocation: zodLocation,
					toLocation: zodLocation,
				})
			)
			.mutation(async ({ input }) => {
				const { fromLocation, toLocation } = input

				// Don't try moving over itself
				if (
					fromLocation.pageNumber === toLocation.pageNumber &&
					fromLocation.column === toLocation.column &&
					fromLocation.row === toLocation.row
				)
					return false

				// Make sure target page number is valid
				if (!pageStore.isPageValid(toLocation.pageNumber)) return false

				// Make sure there is something to move
				const fromControlId = pageStore.getControlIdAt(fromLocation)
				if (!fromControlId) return false

				// Delete the control at the destination
				const toControlId = pageStore.getControlIdAt(toLocation)
				if (toControlId) {
					controlsController.deleteControl(toControlId)
				}

				// Perform the move
				controlEvents.emit('controlRemovedFrom', fromLocation)
				controlEvents.emit('controlPlacedAt', toLocation, fromControlId)

				// Inform the control it was moved
				const control = controlsMap.get(fromControlId)
				if (control) control.triggerLocationHasChanged()

				// Force a redraw
				controlEvents.emit('invalidateLocationRender', fromLocation)
				controlEvents.emit('invalidateLocationRender', toLocation)

				return true
			}),

		copyControl: publicProcedure
			.input(
				z.object({
					fromLocation: zodLocation,
					toLocation: zodLocation,
				})
			)
			.mutation(async ({ input }) => {
				const { fromLocation, toLocation } = input

				// Don't try copying over itself
				if (
					fromLocation.pageNumber === toLocation.pageNumber &&
					fromLocation.column === toLocation.column &&
					fromLocation.row === toLocation.row
				)
					return false

				// Make sure target page number is valid
				if (!pageStore.isPageValid(toLocation.pageNumber)) return false

				// Make sure there is something to copy
				const fromControlId = pageStore.getControlIdAt(fromLocation)
				if (!fromControlId) return false

				const fromControl = controlsMap.get(fromControlId)
				if (!fromControl) return false
				const controlJson = fromControl.toJSON(true)

				// Delete the control at the destination
				const toControlId = pageStore.getControlIdAt(toLocation)
				if (toControlId) {
					controlsController.deleteControl(toControlId)
				}

				const newControlId = CreateBankControlId(nanoid())
				const newControl = controlsController.createClassForControl(newControlId, 'button', controlJson, true)
				if (newControl) {
					controlsMap.set(newControlId, newControl)

					controlEvents.emit('controlPlacedAt', toLocation, newControlId)

					newControl.triggerRedraw()

					return true
				}

				return false
			}),

		swapControl: publicProcedure
			.input(
				z.object({
					fromLocation: zodLocation,
					toLocation: zodLocation,
				})
			)
			.mutation(async ({ input }) => {
				const { fromLocation, toLocation } = input

				// Don't try moving over itself
				if (
					fromLocation.pageNumber === toLocation.pageNumber &&
					fromLocation.column === toLocation.column &&
					fromLocation.row === toLocation.row
				)
					return false

				// Make sure both page numbers are valid
				if (!pageStore.isPageValid(toLocation.pageNumber) || !pageStore.isPageValid(fromLocation.pageNumber))
					return false

				// Find the ids to move
				const fromControlId = pageStore.getControlIdAt(fromLocation)
				const toControlId = pageStore.getControlIdAt(toLocation)

				// Perform the swap
				controlEvents.emit('controlRemovedFrom', toLocation)
				if (toControlId) {
					controlEvents.emit('controlPlacedAt', fromLocation, toControlId)
				} else {
					controlEvents.emit('controlRemovedFrom', fromLocation)
				}
				if (fromControlId) {
					controlEvents.emit('controlPlacedAt', toLocation, fromControlId)
				}

				// Inform the controls they were moved
				const controlA = fromControlId && controlsMap.get(fromControlId)
				if (controlA) controlA.triggerLocationHasChanged()
				const controlB = toControlId && controlsMap.get(toControlId)
				if (controlB) controlB.triggerLocationHasChanged()

				// Force a redraw
				controlEvents.emit('invalidateLocationRender', fromLocation)
				controlEvents.emit('invalidateLocationRender', toLocation)

				return true
			}),

		hotPressControl: publicProcedure
			.input(
				z.object({
					location: zodLocation,
					direction: z.boolean(),
					surfaceId: z.string(),
				})
			)
			.mutation(async ({ input }) => {
				logger.silly(
					`being told from gui to hot press ${formatLocation(input.location)} ${input.direction} ${input.surfaceId}`
				)
				if (!input.surfaceId) throw new Error('Missing surfaceId')

				const controlId = pageStore.getControlIdAt(input.location)
				if (!controlId) return

				controlsController.pressControl(controlId, input.direction, `hot:${input.surfaceId}`)
			}),

		hotRotateControl: publicProcedure
			.input(
				z.object({
					location: zodLocation,
					direction: z.boolean(),
					surfaceId: z.string(),
				})
			)
			.mutation(async ({ input }) => {
				logger.silly(
					`being told from gui to hot rotate ${formatLocation(input.location)} ${input.direction} ${input.surfaceId}`
				)

				const controlId = pageStore.getControlIdAt(input.location)
				if (!controlId) return

				controlsController.rotateControl(
					controlId,
					input.direction,
					input.surfaceId ? `hot:${input.surfaceId}` : undefined
				)
			}),

		hotAbortControl: publicProcedure
			.input(
				z.object({
					location: zodLocation,
				})
			)
			.mutation(async ({ input }) => {
				logger.silly(`being told from gui to abort actions on ${formatLocation(input.location)}`)

				const controlId = pageStore.getControlIdAt(input.location)
				if (!controlId) return

				controlsController.abortAllDelayedActions(null)
			}),

		setStyleFields: publicProcedure
			.input(
				z.object({
					controlId: z.string(),
					styleFields: z.record(z.string(), z.any()),
				})
			)
			.mutation(async ({ input }) => {
				const control = controlsMap.get(input.controlId)
				if (!control) return false

				if (control.supportsStyle) {
					return control.styleSetFields(input.styleFields)
				} else {
					throw new Error(`Control "${input.controlId}" does not support config`)
				}
			}),

		setOptionsField: publicProcedure
			.input(
				z.object({
					controlId: z.string(),
					key: z.string(),
					value: JsonValueSchema.optional(),
				})
			)
			.mutation(async ({ input }) => {
				const control = controlsMap.get(input.controlId)
				if (!control) return false

				if (control.supportsOptions) {
					return control.optionsSetField(input.key, input.value)
				} else {
					throw new Error(`Control "${input.controlId}" does not support options`)
				}
			}),

		pxlFire: publicProcedure
			.input(
				z.object({
					actions: z.array(
						z.object({
							connectionId: z.string(),
							actionId: z.string(),
							options: z.record(z.string(), z.any()),
						})
					),
				})
			)
			.mutation(async ({ input }) => {
				logger.silly(`pxlFire: ${input.actions.length} actions`)
				
				const results = []
				
				for (const actionInput of input.actions) {
					const instance = processManager.getConnectionChild(actionInput.connectionId)
					if (!instance) {
						results.push({ success: false, error: `Connection "${actionInput.connectionId}" not found` })
						continue
					}
					
					const action: ActionEntityModel = {
						type: EntityModelType.Action,
						id: nanoid(),
						connectionId: actionInput.connectionId,
						definitionId: actionInput.actionId,
						options: actionInput.options,
						disabled: false,
						upgradeIndex: undefined,
					}
					
					const controller = new AbortController()
					const extras: RunActionExtras = {
						controlId: "timeline-direct",
						surfaceId: "timeline",
						location: undefined,
						abortDelayed: controller.signal,
						executionMode: "concurrent",
					}
					
					try {
						await instance.actionRun(action, extras)
						results.push({ success: true })
					} catch (error: any) {
						results.push({ success: false, error: error.message })
					}
				}
				
				return results
			}),

		pxlSniff: publicProcedure
			.input(
				z.object({
					queries: z.array(
						z.object({
							connectionId: z.string(),
							feedbackId: z.string(),
							options: z.record(z.string(), z.any()).optional(),
						})
					),
				})
			)
			.query(async ({ input }) => {
				logger.silly(`pxlSniff: ${input.queries.length} queries`)
				
				const results = []
				
				for (const query of input.queries) {
					const instance = processManager.getConnectionChild(query.connectionId)
					if (!instance) {
						results.push({ success: false, error: `Connection "${query.connectionId}" not found` })
						continue
					}
					
					const feedbackEntity: FeedbackEntityModel = {
						type: EntityModelType.Feedback as const,
						id: nanoid(),
						connectionId: query.connectionId,
						definitionId: query.feedbackId,
						options: (query.options || {}) as ExpressionableOptionsObject,
						disabled: false,
						upgradeIndex: undefined,
						isInverted: { value: false, isExpression: false },
					}
					
					try {
						const learnedOptions = await instance.entityLearnValues(feedbackEntity, "timeline-learn")
						results.push({ success: true, value: learnedOptions })
					} catch (error: any) {
						results.push({ success: false, error: error.message })
					}
				}
				
				return results
			}),

		pxlPeek: publicProcedure
			.input(
				z.object({
					queries: z.array(
						z.object({
							connectionId: z.string(),
							actionId: z.string(),
						})
					),
				})
			)
			.query(async ({ input }) => {
				logger.silly(`pxlPeek: ${input.queries.length} queries`)
				
				const results = []
				
				for (const query of input.queries) {
					const actionDef = instanceDefinitions.getEntityDefinition(
						EntityModelType.Action,
						query.connectionId,
						query.actionId
					)
					
					if (!actionDef) {
						results.push({ 
							success: false, 
							error: `Action "${query.actionId}" not found for connection "${query.connectionId}"` 
						})
						continue
					}
					
					results.push({
						success: true,
						actionId: query.actionId,
						label: actionDef.label,
						description: actionDef.description,
						hasLearn: !!actionDef.hasLearn,
						learnTimeout: actionDef.learnTimeout,
						options: actionDef.options.map((opt: any) => ({
							id: opt.id,
							label: opt.label,
							type: opt.type,
							min: opt.min,
							max: opt.max,
							step: opt.step,
							default: opt.default,
							choices: opt.choices,
							tooltip: opt.tooltip,
						})),
					})
				}
				
				return results
			}),
	}
}
