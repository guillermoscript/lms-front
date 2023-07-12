import axios from "axios";
import { GetServerSidePropsContext } from "next";
import AccountHeader from "../../../components/Account/AccountHeader";
import AccountPaymentMethods from "../../../components/Account/AccountPaymentMethods";
import DashboardLayout from "../../../components/Dashboard/DashboardLayout";
import { User } from "../../../payload-types";
import { UserMeResponse } from "../../../utils/types/common";
import AccountMenu from "../../../components/Account/AccountMenu";
import AccountLayout from "../../../components/Account/AccountLayout";
import { apiUrl } from "../../../utils/env";

type PaymentMethodPageProps = {
    user: User;
};

export default function PaymentMethodPage( { user }: PaymentMethodPageProps) {

  return (
    <AccountLayout user={user}>
      <AccountPaymentMethods user={user} />
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
  