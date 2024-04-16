import { Sidebar } from "@/components/dashboard/Sidebar";
import { DataTable } from "@/components/ui/Table/data-table";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { orderCols } from "./columns";

export default async function OrdersPage() {
	return (
		<>
            <OrderTable />
		</>
	);
}   

async function OrderTable() {
	
    const cookieStore = cookies();
	const supabase = createClient(cookieStore);

	const orders = await supabase.from("invoices").select(` 
        id,
        status,
        created_at,
        paid_at,
        due_date,
        currencies ( code )
    `);

	console.log(orders.data);

    if (orders.error) {
        return <div> Error </div>
    }

    if (!orders.data) {
        return <div> No orders </div>
    }

	return (
		<DataTable
			columns={orderCols}
			data={orders.data}
		/>
	);
}
