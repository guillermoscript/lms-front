import { useQuery } from 'react-query';
import GenericTable from '../Table/GenericTable';
import axios from 'axios';
import { PaginatedDocs } from '../../utils/types/common';
import { Order } from '../../payload-types';
import SkeletonTable from '../Skeletons/SkeletonTable';
import dayjs from 'dayjs';
import Link from 'next/link';
import payloadClient from '../../utils/axiosPayloadInstance';
import { DaisyUiAlert } from '../Alert/DaisyUiAlerts';
import useQueryUserOrders from './hooks/useQueryUSerOrders';

type AccountTableProps = {
  theads: string[];
  children: React.ReactNode;
};

export default function OrderTable() {
  
  const query = useQueryUserOrders();

  const status: Record<string, { text: string; className: string; tooltipText?: string; tooltipClassName?: string }> = {
    active: {
      text: 'Activo',
      className: 'text-success',
      tooltipText: 'Tu pago fue aceptado',
      tooltipClassName: 'bg-success-content p-2',
    },
    inactive: {
      text: 'Procesando',
      className: 'text-primary',
      tooltipText: 'Tu pago está siendo procesado',
      tooltipClassName: 'bg-primary-content p-2',
    },
    canceled: {
      text: 'Cancelado',
      className: 'text-error',
      tooltipText: 'Tu pago fue cancelado',
      tooltipClassName: 'bg-error-content p-2',
    },
    pending: {
      text: 'Pendiente de pago',
      className: 'text-accent',
      tooltipText: 'Por favor realiza el pago',
      tooltipClassName: 'bg-accent-content p-2',
    },
    refunded: {
      text: 'Reembolsado',
      className: 'text-warning',
      tooltipText: 'Tu pago fue reembolsado',
      tooltipClassName: 'bg-warning-content p-2',
    },
    finished: {
      text: 'Finalizado',
      className: 'text-neutral',
      tooltipText: 'Tu orden de subscripción ha finalizado',
      tooltipClassName: 'bg-neutral-content p-2',
    },
  };

  if (query.isLoading) {
    return <SkeletonTable />;
  }

  if (query.isError) return (
    <div className="flex-auto w-full px-4 lg:px-10 py-10">
      <DaisyUiAlert type="error" message="Error al cargar los métodos de pago" />
    </div>
  )

  return (
    <>
      {query.isSuccess && query.data.docs.length === 0 && (
        <>
          <h3 className="text-xl font-medium mb-4">No tienes ordenes</h3>
          <p>Puedes ir a la tienda</p>
          <Link href="/store">
              <a className="btn btn-accent mt-4">Ir a la tienda</a>
          </Link>
        </>
      )}
      {query.isSuccess && query.data.docs.length > 0 && (
        <GenericTable theads={['Id', 'Fecha', 'Estado', 'Total']}>
          {query.data?.docs.map((order) => {
            const statusOfOrder = status[order.status as keyof typeof status];

            return (
              <tr key={order.id}>
                <td>{order.id}</td>
                <td>{dayjs(order.createdAt).format('DD/MM/YYYY')}</td>
                <td className={statusOfOrder.className}>
                  {order.status === 'pending' ? (
                    <div className="tooltip" data-tip={statusOfOrder.tooltipText}>
                      <Link href={`/dashboard/order/${order.id}`}>
                        <a
                          className="bg-accent-content text-accent hover:bg-accent hover:text-accent-content rounded transition duration-200 px-4 py-2"
                        >{statusOfOrder.text}</a>
                      </Link>
                    </div>
                  ) : (
                    
                    <div className={`tooltip ${statusOfOrder.tooltipClassName}`}
                      data-tip={statusOfOrder.tooltipText}>
                      {statusOfOrder.text}
                    </div>
                  )}
                </td>
                <td>${order.amount}</td>
              </tr>
            );
          })}
        </GenericTable>
      )}
    </>
  );
}
