import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SubsidyReceiptPreview } from '@/lib/subsidyReceiptUpload';
import { PartnerSubsidyReceiptUpload } from './PartnerSubsidyReceiptUpload';

// 1x1 transparent PNG data URI used as a stand-in receipt thumbnail.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const mockFiles: SubsidyReceiptPreview[] = [
  { id: 'r1', file: new File([], '会议场地发票.png', { type: 'image/png' }), previewUrl: PNG, isVideo: false },
  { id: 'r2', file: new File([], '餐补收据.png', { type: 'image/png' }), previewUrl: PNG, isVideo: false },
  { id: 'r3', file: new File([], '宣讲现场.mp4', { type: 'video/mp4' }), previewUrl: '', isVideo: true },
];

const meta = {
  title: 'partner/PartnerSubsidyReceiptUpload',
  component: PartnerSubsidyReceiptUpload,
  args: {
    lang: 'zh-CN',
    isDark: false,
    files: [],
    onChange: () => {},
    uploading: false,
  },
} satisfies Meta<typeof PartnerSubsidyReceiptUpload>;

export default meta;
type S = StoryObj<typeof meta>;

export const Empty: S = {};
export const WithReceipts: S = { args: { files: mockFiles } };
export const Uploading: S = { args: { files: mockFiles, uploading: true } };
