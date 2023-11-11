import { GetServerSidePropsContext } from "next";

export default function getPayloadCookie(context: GetServerSidePropsContext) {

    const cookies = context.req.headers.cookie;
    const payloadToken = cookies?.split(";").find((c: string) => c.trim().startsWith("payload-token="));
    const token = payloadToken?.split("=")[1];

    return token;
}