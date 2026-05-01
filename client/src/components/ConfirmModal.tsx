type Props = {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open, title, message, confirmLabel = 'Подтвердить', cancelLabel = 'Отмена',
  onConfirm, onCancel,
}: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg shadow-xl p-6 min-w-[280px] max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-2">{title}</h2>
        {message !== undefined && <p className="text-sm text-gray-700 mb-4">{message}</p>}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            className="px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-100"
            onClick={onCancel}
          >{cancelLabel}</button>
          <button
            type="button"
            className="px-3 py-1.5 rounded bg-sky-600 text-white hover:bg-sky-700"
            onClick={onConfirm}
          >{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
