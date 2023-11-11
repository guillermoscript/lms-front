import axios from "axios";
import { GetServerSidePropsContext } from "next";
import { User } from "../../../payload-types";
import { UserMeResponse } from "../../../utils/types/common";
import OrderTable from "../../../components/Account/AccountOrderTable";
import AccountLayout from "../../../components/Account/AccountLayout";
import { apiUrl } from "../../../utils/env";

export default function MyOrders({ user }: { user: User }) {
    
    return (
        <AccountLayout user={user}>
            <OrderTable />
        </AccountLayout>
    )
}


export async function getServerSideProps(context: GetServerSidePropsContext) {
        try {
        const response = await axios.get<UserMeResponse>(apiUrl + '/api/users/me', {
            // Make sure to include cookies with fetch
            withCredentials: true,
            headers: {
            Authorization: `JWT ${context.req.cookies['payload-token']}`,
            },
        });
    
        const user = response.data.user as User;
    
        return {
            props: {
            user: user,
            },
        };
        } catch (error) {
        console.log(error);
    
        return {
            props: {
            redirect: {
                destination: '/auth/login',
                permanent: false,
            },
            },
        };
        }
}