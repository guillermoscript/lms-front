import axios from 'axios';
import { PaymentMethod, User } from '../../payload-types';
import { useQuery } from 'react-query';
import SkeletonTable from '../Skeletons/SkeletonTable';
import { PaginatedDocs } from '../../utils/types/common';
import GenericTable from '../Table/GenericTable';
import { useState } from 'react';
import AccountPaymentModal from './AccountPaymentModal';
import { UpdatePaymentMethodModal } from './Modals/UpdatePaymentMethodModal';
import { DeletePaymentMethodModal } from './Modals/DeletePaymentMethodModal';
import AddPaymentMethodModal from './Modals/AddPaymentMethodModal';
import { apiUrl } from '../../utils/env';
import payloadClient from '../../utils/axiosPayloadInstance';
import { DaisyUiAlert } from '../Alert/DaisyUiAlerts';
import useQueryPaymentMethods from './hooks/useQueryPaymentMethods';

type AccountPaymentMethodsProps = {
  user: User;
};

const PAYMENT_MODAL_TYPES = {
  ADD: 'ADD',
  EDIT: 'EDIT',
  DELETE: 'DELETE',
  CLOSE: 'CLOSE',
} as const;

export type PaymentModalType = typeof PAYMENT_MODAL_TYPES[keyof typeof PAYMENT_MODAL_TYPES];

const classNames = {
  container: 'relative w-full mb-3',
  label: 'block uppercase text-xs font-bold mb-2',
  input:
    'input input-bordered border-0 px-3 py-3 rounded text-sm shadow focus:outline-none focus:ring w-full ease-linear transition-all duration-150 focus:ring-primary-content',
};

export default function AccountPaymentMethods({ user }: AccountPaymentMethodsProps) {
  
  const query = useQueryPaymentMethods();

  const [showModal, setShowModal] = useState<PaymentModalType>('CLOSE');
  const [paymentMethod, setPaymentMethod] = useState<any>({});

  if (query.isLoading)
    return (
      <div className="flex-auto w-full px-4 lg:px-10 py-10">
        <SkeletonTable />
      </div>
    );

  if (query.isError) return (
    <div className="flex-auto w-full px-4 lg:px-10 py-10">
      <DaisyUiAlert type="error" message="Error al cargar los métodos de pago" />
    </div>
  )

  return (
    <>
      {/* {showModal && <PaymentMethodModal />} */}
      <div className="flex-auto w-full px-4 lg:px-10 py-10">
        {query.isSuccess && query.data.docs.length === 0 && (
            <>
              <div className="alert alert-info mb-8">
                <button
                  onClick={() => {
                    setShowModal('ADD');
                  }}
                  className="btn btn-info">Click Aquí</button>
                <span> para agregar un nuevo método de pago.</span>
              </div>
            </>
        )}

        {query.isSuccess && query.data.docs.length > 0 && (
          <>
          <div className="alert alert-info mb-8">
            <button
              onClick={() => {
                setShowModal('ADD');
              }}
              className="btn btn-info">Click Aquí</button>
            <span> para agregar un nuevo método de pago.</span>
          </div>
            <GenericTable theads={['Nombre', 'Tipo de pago', 'Acciones']}>
              {query.data.docs.map((paymentMethod) => {
                return (
                  <tr key={paymentMethod.id}>
                    <td>{paymentMethod.title}</td>
                    <td>{paymentMethod.paymentMethodType}</td>
                    <td>
                      <button
                        onClick={() => {
                          const paymentMethodType = paymentMethod.paymentMethodType;
                          const defaultValues = Object.assign({}, paymentMethod[paymentMethodType]);
                          setPaymentMethod({
                            defaultValues: defaultValues,
                            paymentMethodSelected: paymentMethodType,
                            id: paymentMethod.id,
                          });
                          setShowModal('EDIT');
                        }}
                        className="btn mx-2 btn-sm btn-primary"
                      >
                        Editar
                      </button>
                      <button 
                        onClick={() => {
                          setPaymentMethod({ id: paymentMethod.id });
                          setShowModal('DELETE');
                        }}
                        className="btn btn-sm btn-error">Eliminar</button>
                    </td>
                  </tr>
                );
              })}
            </GenericTable>
          </>
        )}
        {showModal === PAYMENT_MODAL_TYPES.EDIT && paymentMethod.defaultValues && paymentMethod.paymentMethodSelected && (
          <AccountPaymentModal onClose={() => setShowModal('CLOSE')} setShowModal={setShowModal}>
            <UpdatePaymentMethodModal
              defaultValues={paymentMethod.defaultValues}
              paymentMethodSelected={paymentMethod.paymentMethodSelected}
              paymentMethodId={paymentMethod.id}
              onClose={() => setShowModal('CLOSE')}
            />
          </AccountPaymentModal>
        )}
        {showModal === PAYMENT_MODAL_TYPES.DELETE && (
          <AccountPaymentModal onClose={() => setShowModal('CLOSE')} setShowModal={setShowModal}>
            <DeletePaymentMethodModal
              paymentMethodId={paymentMethod.id}
              onClose={() => setShowModal('CLOSE')}
            />
          </AccountPaymentModal>
        )}
        {showModal === PAYMENT_MODAL_TYPES.ADD && (
          <AccountPaymentModal onClose={() => setShowModal('CLOSE')} setShowModal={setShowModal}>
            <AddPaymentMethodModal
              user={user}
              onClose={() => setShowModal('CLOSE')}
            />
          </AccountPaymentModal>
        )}
      </div>
    </>
  );
}
