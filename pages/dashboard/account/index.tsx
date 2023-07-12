import React from 'react';
import DashboardLayout from '../../../components/Dashboard/DashboardLayout';
import { GetServerSidePropsContext } from 'next';
import axios from 'axios';
import { User } from '../../../payload-types';
import AccountHeader from '../../../components/Account/AccountHeader';
import { UserMeResponse } from '../../../utils/types/common';
import AccountMenu from '../../../components/Account/AccountMenu';
import AccountInfo from '../../../components/Account/AccountInfo';
import { apiUrl } from '../../../utils/env';
import AccountLayout from '../../../components/Account/AccountLayout';

type FormData = {
  email: string;
  firstName: string;
  lastName: string;
};

type AccountProps = {
  user: User;
};

export default function Account({ user }: AccountProps) {
  
  console.log(user)
  if (!user) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-screen">
          <p className="text-2xl text-blueGray-400">Loading...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <AccountLayout user={user}>
      <div className="flex flex-col justify-center items-center gap-3">
        <AccountInfo user={user} />
      </div>
    </AccountLayout>
  );
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
