import payloadClient from '../../../utils/axiosPayloadInstance';
import { PaymentMethods, pagoMovilSchema, zelleSchema } from '../../Checkout/CheckoutForm';
import * as yup from 'yup';
import { Form } from '../../Forms/SmartForm';
import { User } from '../../../payload-types';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const postPaymentMethod = async (data: any) => {
    const response = await payloadClient.post('/api/payment-methods', data);
    return response.data;
};

const PaymentMethodsSchema = yup.object().shape({
    paymentMethod: yup.string().required('Debe seleccionar un método de pago'),
    ...zelleSchema.fields,
    ...pagoMovilSchema.fields,
});

export default function AddPaymentMethodModal({ onClose, user }: { onClose: () => void, user: User }) {

    const mutation = useMutation({
        mutationFn: postPaymentMethod,
    })
    const queryClient = useQueryClient();

    function onSubmit(values: any) {

        mutation.mutate({
            paymentMethodType: values.paymentMethod,
            title: values.title,
            [values.paymentMethod]: {
                ...values
            },
            paymentsOfUser: user.id
        },
        {
            onSuccess: () => {
                queryClient.invalidateQueries({
                    queryKey: ['userPaymentMethods', user.id]
                });
                onClose();
            },
            onError: () => {
                console.log('error')
            }
        })

    }

    return (
        <Form schema={PaymentMethodsSchema} onSubmit={onSubmit} classes="grid grid-cols-6 gap-4">
            <Form.Input
                name="title"
                displayName="Título"
                type="text"
                clasess={{
                    container: 'col-span-6 sm:col-span-3',
                    label: 'block text-xs mb-2',
                    input: 'input input-bordered w-full max-w-xs',
                    error: "alert alert-error text-xs gap-2 my-4",
                }}
            />
            <PaymentMethods />
            <button 
                disabled={mutation.isPending || mutation.isSuccess}
                type="submit" className="btn btn-secondary col-span-6">
                {mutation.isPending ? 'Agregando...' : ''}
                {mutation.isSuccess && 'Agregado'}
                {!mutation.isPending && !mutation.isSuccess && 'Agregar'}
            </button>
            {mutation.isError && <div className="col-span-6 text-red-500">Ocurrion un error</div>}
            {mutation.isSuccess && <div className="col-span-6 text-green-500">Método de pago agregado</div>}
            {mutation.isPending && <div className="col-span-6 text-yellow-500">Agregando método de pago...</div>}
        </Form>
    );
}
