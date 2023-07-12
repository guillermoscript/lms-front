
import LoginForm from "../Auth/LoginForm";
import Modal, { RenderChildProps } from "./Modal";

type LoginModalProps = {
    onClose: () => void;
};

export default function LoginModal({ onClose } : LoginModalProps) {

    const renderChild = ({ onClose }: RenderChildProps) => <LoginForm />;

    return (
        <Modal
            onClose={onClose}
            renderChild={renderChild}
        />
    );
}