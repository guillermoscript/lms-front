import { useCallback, useRef } from "react";
import useOnClickOutside from "~/utils/hooks/useOnClickOutside";
// import styles from "./css/Modal.module.css"

export type RenderChildProps = {
  onClose: () => void;
};

export type ModalProps = {
  onClose: () => void;
  renderChild: (props: RenderChildProps) => JSX.Element;
};

function Modal({ onClose, renderChild }: ModalProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback(() => {
    onClose?.();
  }, [onClose]);

  useOnClickOutside(menuRef, handleClickOutside);

  return (
    <div className="fixed inset-0 z-[1000] bg-[#37394C80] ">
      <div className="flex h-screen w-full flex-col items-center justify-center">
        <div ref={menuRef}>
          {renderChild({
            onClose: handleClickOutside,
          })}
        </div>
      </div>
    </div>
  );
}

export default Modal;

Modal.defaultProps = {} as Partial<ModalProps>;
