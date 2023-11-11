import { User } from "../../../payload-types";
import useKeypress from "../../../utils/hooks/useKeyPress";
import Modal, { RenderChildProps } from "../../Modal/Modal";
import AIChatBot from "../AIChatBot";

type ModalProps = {
    onClose: () => void;
    user: User;
};

export default function AIChatBotModal({ onClose, user } : ModalProps) {

    const renderChild = ({ onClose }: RenderChildProps) => (
        <div className="max-w-5xl modal-box"> 
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-medium">Responde tus dudas con el Profe-bot 🤖</h3>
                {/* if there is a button in div, it will close the modal */}
                <button onClick={onClose} className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">
                    X
                </button>
            </div>
        <AIChatBot user={user} />
    </div>
    )
    useKeypress('Escape', () => onClose());

    return (
        <Modal
            onClose={onClose}
            renderChild={renderChild}
        />
    );
}
