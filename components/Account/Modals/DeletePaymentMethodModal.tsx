import { useQueryClient, useMutation } from "react-query";
import payloadClient from "../../../utils/axiosPayloadInstance";
import { MutationMessageStates } from "../AccountPaymentModal";


const deletePaymentMethod = async (paymentMethodId: string) => {
    const response = await payloadClient.delete(`/api/payment-methods/${paymentMethodId}`);
    return response.data;
  }
  
  type DeletePaymentMethodModalProps = { onClose: () => void; paymentMethodId: string }
  
  export function DeletePaymentMethodModal({ onClose, paymentMethodId }: DeletePaymentMethodModalProps) {
  
    const queryClient = useQueryClient();
  
    const mutation = useMutation(deletePaymentMethod, {
      onSuccess: (data, variables) => {
        console.log('useMutationDeletePaymentMethod onSuccess', data);
        queryClient.invalidateQueries('userPaymentMethods');
        onClose();
      },
      onError: (error, variables) => {
        console.log('useMutationDeletePaymentMethod onError', error);
      },
    });
  
    return (
      <div className="flex flex-col items-center justify-center p-6 gap-4">
        <h2 className="text-xl">¿Estás seguro que deseas eliminar este método de pago?</h2>
  
        <MutationMessageStates mutation={mutation} />
        <div className="flex justify-end">
          <button
            onClick={() => {
              mutation.mutate(paymentMethodId);
            }}
            className="btn btn-sm btn-circle ">Si, lo quiero eliminar</button>
        </div>
      </div>
    );
  }
  