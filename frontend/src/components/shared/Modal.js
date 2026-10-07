import React from 'react';
import { X } from 'lucide-react';

/**
 * Base Modal component
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {Function} props.onClose - Function to close the modal
 * @param {string} props.theme - Theme context ('dark' or 'light')
 * @param {React.ReactNode} props.children - Modal content
 * @param {string} props.maxWidth - Max width class (e.g., 'max-w-md', 'max-w-4xl')
 */
export const Modal = ({ isOpen, onClose, theme, children, maxWidth = 'max-w-md' }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className={`w-full ${maxWidth} rounded-xl shadow-xl ${
                theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'
            }`}>
                {children}
            </div>
        </div>
    );
};

/**
 * Modal Header component
 */
export const ModalHeader = ({ theme, title, subtitle, onClose }) => {
    return (
        <div className="flex items-start justify-between p-6 pb-4">
            <div className="flex-1">
                <h3 className="text-lg font-bold mb-1">{title}</h3>
                {subtitle && (
                    <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        {subtitle}
                    </p>
                )}
            </div>
            {onClose && (
                <button
                    onClick={onClose}
                    className={`p-1 rounded-lg ${
                        theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
                    }`}
                >
                    <X className="w-5 h-5" />
                </button>
            )}
        </div>
    );
};

/**
 * Modal Content component
 */
export const ModalContent = ({ children, className = '' }) => {
    return <div className={`px-6 pb-4 ${className}`}>{children}</div>;
};

/**
 * Modal Footer component
 */
export const ModalFooter = ({ children, className = '' }) => {
    return <div className={`flex gap-3 p-6 pt-4 ${className}`}>{children}</div>;
};

/**
 * Confirmation Modal (pre-built)
 */
export const ConfirmationModal = ({
    isOpen,
    onClose,
    onConfirm,
    theme,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    icon: Icon,
    iconColor = 'text-orange-500',
    confirmButtonClass = 'bg-orange-600 hover:bg-orange-700'
}) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} theme={theme}>
            <div className="p-6">
                {Icon && (
                    <div className={`flex items-start gap-4 mb-4`}>
                        <div className={`p-3 rounded-lg ${
                            theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'
                        }`}>
                            <Icon className={`w-6 h-6 ${iconColor}`} />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-bold mb-2">{title}</h3>
                            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                {message}
                            </p>
                        </div>
                    </div>
                )}
                {!Icon && (
                    <>
                        <h3 className="text-lg font-bold mb-2">{title}</h3>
                        <p className={`text-sm mb-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                            {message}
                        </p>
                    </>
                )}

                <div className="flex gap-3 pt-4">
                    <button
                        onClick={onClose}
                        className={`flex-1 px-4 py-2 rounded-lg font-medium ${
                            theme === 'dark'
                                ? 'bg-gray-800 hover:bg-gray-700'
                                : 'bg-gray-200 hover:bg-gray-300'
                        }`}
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`flex-1 px-4 py-2 text-white rounded-lg font-medium ${confirmButtonClass}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default Modal;
