import { useQueryClient, useMutation, UseMutationResult } from 'react-query';
import payloadClient from '../../utils/axiosPayloadInstance';
import useKeypress from '../../utils/hooks/useKeyPress';
import { venezuelanBanks } from '../../utils/venezuelaBanks';
import {
  pagoMovilSchema,
  zelleSchema,
  formInputPaymentDataZelle,
  formInputPaymentDataPagoMovil,
  PaymentMethods,
} from '../Checkout/CheckoutForm';
import { Form } from '../Forms/SmartForm';
import Modal, { RenderChildProps } from '../Modal/Modal';
import { PaymentModalType } from './AccountPaymentMethods';
import * as yup from "yup";

type PaymentMethodModalProps = {
  children: React.ReactNode;
  setShowModal: React.Dispatch<React.SetStateAction<PaymentModalType>>;
  onClose: () => void;
};

function PaymentMethodModalChild({ children, setShowModal, onClose }: PaymentMethodModalProps) {
  useKeypress('Escape', () => setShowModal('CLOSE'));

  return (
    <div className="modal-box">
      {children}
      {/* if there is a button in div, it will close the modal */}
      <button onClick={onClose} className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">
        X
      </button>
    </div>
  );
}

export default function AccountPaymentModal({ onClose, setShowModal, children }: PaymentMethodModalProps) {
  const renderChild = ({ onClose }: RenderChildProps) => (
    <PaymentMethodModalChild setShowModal={setShowModal} onClose={onClose}>
      {children}
    </PaymentMethodModalChild>
  );

  return <Modal onClose={onClose} renderChild={renderChild} />;
}


export function MutationMessageStates({ mutation }: { mutation: any }) {
  return (
    <>
    {
      mutation.isLoading && <div className="alert alert-info">Carg...</div>
    }

    {
      mutation.isError && <div className="alert alert-error">
      <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      <span> Ocurrio un error, Por favor intenta mas tarde</span>
      <div>
        <button type='button' className="btn btn-sm btn-primary">cerrar</button>
      </div>
    </div>
    }

    {
      mutation.isSuccess && <div className="alert alert-success">Guardado exitoso</div>
    }
    </>
  )
}