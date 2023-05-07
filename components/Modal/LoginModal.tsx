import LoginComponent from "../Forms/Login";
import Modal, { RenderChildProps } from "./Modal";

type LoginModalProps = {
    onClose: () => void;
};

export default function LoginModal({ onClose } : LoginModalProps) {

    const renderChild = ({ onClose }: RenderChildProps) => <LoginComponent />;

    return (
        <Modal
            onClose={onClose}
            renderChild={renderChild}
        />
    );
}