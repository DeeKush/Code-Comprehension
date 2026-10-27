const { z } = require('zod');

const noPayload = ['getState','newChat','cancelRequest','attachCurrentFile','attachSelection','pickFile','pickFolder','configureGroq','testGroq','refreshModels','removeGroqKey','openInterviewLab','applyPatch','rejectPatch','recoverChats'];
const incoming = z.discriminatedUnion('type', [
  ...noPayload.map(type=>z.object({type:z.literal(type),payload:z.object({}).strict()}).strict()),
  ...['selectChat','clearChat','deleteChat','retryMessage'].map(type=>z.object({type:z.literal(type),payload:z.object({chatId:z.string().uuid()}).strict()}).strict()),
  z.object({type:z.literal('sendMessage'),payload:z.object({chatId:z.string().uuid(),text:z.string().min(1).max(8000)}).strict()}).strict(),
  z.object({type:z.literal('removeAttachment'),payload:z.object({index:z.number().int().nonnegative().max(7)}).strict()}).strict(),
  z.object({type:z.literal('toggleWorkspace'),payload:z.object({include:z.boolean()}).strict()}).strict(),
  z.object({type:z.literal('setModel'),payload:z.object({model:z.string().regex(/^[a-zA-Z0-9._/-]{2,100}$/)}).strict()}).strict(),
  z.object({type:z.literal('proposePatch'),payload:z.object({text:z.string().min(1).max(4000)}).strict()}).strict(),
  z.object({type:z.literal('previewPatch'),payload:z.object({index:z.number().int().nonnegative().max(2)}).strict()}).strict()
  ,z.object({type:z.literal('insertCode'),payload:z.object({chatId:z.string().uuid(),messageId:z.string().uuid()}).strict()}).strict()
]);

module.exports={incoming};
