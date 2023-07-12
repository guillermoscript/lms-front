import { forwardRef } from "react";
import { IndexPageRef } from "../../../utils/types/common";
import AIChatBot from "../../../components/AI/AIChatBot";
import axios from "axios";
import { apiUrl } from "../../../utils/env";
import { LoginResponse } from "../../../components/Auth";
import { GetServerSidePropsContext } from "next";
import { User } from "../../../payload-types";
import AccountLayout from "../../../components/Account/AccountLayout";
import tryCatch from "../../../utils/tryCatch";
import Link from "next/link";
import NoActiveCourseMessage from "../../../components/Account/NoActiveCourseMessage";

type ChatPageProps = {
    user: User
    isAtLeastOneCourseEnrolled: any
}

function ChatPage(props: ChatPageProps, ref: IndexPageRef) {

    const { user, isAtLeastOneCourseEnrolled } = props;
    
    if (!isAtLeastOneCourseEnrolled) {
        return (
            <AccountLayout user={user}>
                <NoActiveCourseMessage />
            </AccountLayout>
        );
    }

    return (
        <AccountLayout user={user}>
            <AIChatBot  user={user} />
        </AccountLayout>
    );

}

export default forwardRef(ChatPage);


export async function getServerSideProps({ query, req }: GetServerSidePropsContext) {

    try {

        const [user, userError] = await tryCatch(axios.get<LoginResponse>(apiUrl + '/api/users/me', {
            withCredentials: true,
            headers: {
                Authorization: `JWT ${req.cookies['payload-token']}`,
            },
        }));

        if (userError) {
            return {
                redirect: {
                    destination: '/auth/login',
                    permanent: false,
                },
            };
        }

        const data = user?.data.user;

        const [isAtLeastOneCourseEnrolled, isAtLeastOneCourseEnrolledError] = await tryCatch(axios.get(apiUrl + '/api/enrollments/check', {
            withCredentials: true,
            headers: {
                Authorization: `JWT ${req.cookies['payload-token']}`,
            },
        }));

        if (isAtLeastOneCourseEnrolledError) {
            return {
                props: {
                    user: data,
                    isAtLeastOneCourseEnrolled: false
                }
            };
        }

        console.log(isAtLeastOneCourseEnrolled?.data, 'isAtLeastOneCourseEnrolled?.data ')

        return {
            props: {
                user: data,
                isAtLeastOneCourseEnrolled: isAtLeastOneCourseEnrolled?.data
            }
        }
    } catch (error) {
        console.log(error)
        return {
            props: {
                user: null
            }
        }
    }
}
