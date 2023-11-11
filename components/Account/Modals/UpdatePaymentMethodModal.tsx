import { useMutation, useQueryClient } from '@tanstack/react-query';
import payloadClient from '../../../utils/axiosPayloadInstance';
import { venezuelanBanks } from '../../../utils/venezuelaBanks';
import {
  pagoMovilSchema,
  zelleSchema,
  formInputPaymentDataZelle,
  formInputPaymentDataPagoMovil,
} from '../../Checkout/CheckoutForm';
import { Form } from '../../Forms/SmartForm';
import { MutationMessageStates } from '../AccountPaymentModal';

const clases = {
  container: 'col-span-6 w-full',
  label: 'block text-xs mb-2',
  input: 'input input-bordered w-full',
  error: 'alert alert-error text-xs gap-2 my-4',
};

type PaymentMethodDto = {
  paymentMethodId: string;
  data: any;
};

const putPaymentMethod = async ({ paymentMethodId, data }: PaymentMethodDto) => {
  const response = await payloadClient.put(`/api/payment-methods/${paymentMethodId}`, data);
  return response.data;
};

export function UpdatePaymentMethodModal({
  defaultValues,
  paymentMethodSelected,
  paymentMethodId,
  onClose,
}: {
  defaultValues: any;
  paymentMethodSelected: any;
  paymentMethodId: string;
  onClose: () => void;
}) {
  const paymentMethods = {
    pagoMovil: {
      schema: pagoMovilSchema,
    },
    zelle: {
      schema: zelleSchema,
    },
  };

  const paymentMethodSelectedSchema = paymentMethods[paymentMethodSelected as keyof typeof paymentMethods];
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: putPaymentMethod, 
      onSuccess: (data, variables) => {
        console.log('useMutationUpdatePaymentMethod onSuccess', data);
        onClose();
        queryClient.invalidateQueries({
          queryKey: ['userPaymentMethods', paymentMethodId],
        });
      },
      onError: (error, variables) => {
        console.log('useMutationUpdatePaymentMethod onError', error);
      },
    
  });

  return (
    <Form
      onSubmit={async (values) => {
        console.log(values);
        console.log(paymentMethodSelected);
        console.log(paymentMethodId);
        mutation.mutate({
          paymentMethodId: paymentMethodId,
          data: {
            [paymentMethodSelected]: values,
          },
        });
      }}
      defaultValues={defaultValues}
      schema={paymentMethodSelectedSchema.schema}
      classes="grid gap-4 mb-4 sm:grid-cols-2"
    >
      {paymentMethodSelected === 'zelle' &&
        formInputPaymentDataZelle.map((input, index) => (
          <Form.Input key={index} name={input.name} displayName={input.label} type={input.type} clasess={clases} />
        ))}
      {paymentMethodSelected === 'pagoMovil' && (
        <>
          {formInputPaymentDataPagoMovil.map((input, index) => (
            <Form.Input key={index} name={input.name} displayName={input.label} type={input.type} clasess={clases} />
          ))}
          <Form.Select name="pagoMovilBank" displayName="Banco" clasess={clases} options={venezuelanBanks} />
        </>
      )}

      <MutationMessageStates mutation={mutation} />

      <button disabled={mutation.isPending} className="btn btn-primary">
        Guardar
      </button>
    </Form>
  );
}
