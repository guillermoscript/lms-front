
import axios, { AxiosRequestConfig, AxiosResponse, AxiosError, InternalAxiosRequestConfig } from "axios";
import dayjs from "dayjs";
import Cookies from "js-cookie";
import { RefreshTokenResponse } from "../components/Auth";
import { isInPast } from "./days";
import jwt from 'jwt-simple'
import { nameOfPayloadCookie } from "./globals";
import { apiUrl } from "./env";
// import { getApiRoute } from '@src/utils/apiRoutes';
// import { formatSession, RefreshSessionResponse, Session } from "@src/utils/session";
// import { keysInLocalStorage } from "./global";

type Session = {
    "email": string
    "id": string
    "collection": string
    "roles": string[]
    "iat": number
    "exp": number
}

let isRequesting = false;

const defaultPayloadConfig = {
    timeout: 60000,
    headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    baseURL: apiUrl
} as AxiosRequestConfig;

const payloadClient = axios.create(defaultPayloadConfig);

/**
 * Handle global request success responses
 * 
 */
export function successInterceptor(response: AxiosResponse) {

    return response;
}

/**
 * Handle global request error responses
 * 
 */
export function failInterceptor(error: AxiosError) {
    return error
}

async function refreshToken() {
    try {
        const instance = axios.create(defaultPayloadConfig);

        instance.interceptors.request.clear()

        const response = await instance.post<RefreshTokenResponse>("/api/users/refresh-token", {}, {
            withCredentials: true,
        });

        return response.data;
    } catch (error) {
        console.log("error updating token")
        // Manejo de errores en la solicitud de actualización del token
        throw error;
    }
}

function tryToSetSession(config: InternalAxiosRequestConfig) {
    
    const session = localStorage.getItem("token")
    console.log(session)
    if (!session) return
    // const value = JSON.parse(session)
    // config.headers.Authorization = `JWT ${value}`
    config.headers.Authorization = `JWT ${session}`
}

export async function beforeSendInterceptor(config: InternalAxiosRequestConfig) {

    tryToSetSession(config)

    const payloadCookie = Cookies.get(nameOfPayloadCookie)

    if (!payloadCookie) return config
    
    const cookieValue = jwt.decode(payloadCookie, "", true) as Session

    const expirationDate = dayjs(cookieValue.exp as number * 1000 ).add(10, "minutes");

    if (isInPast(expirationDate)) {
        if (isRequesting) return config
        // La cookie ha expirado
        try {
            isRequesting = true;
            const refreshTokenResponse = await refreshToken();

            const sessionWithToken = formatSession(refreshTokenResponse.refreshedToken, cookieValue)

            Cookies.set(nameOfPayloadCookie, sessionWithToken.jwt, {
                expires: sessionWithToken.expirationDate
            })

            isRequesting = false;
        } catch (error) {
            console.log("error updating token", error)
            // Manejo de errores en la solicitud de actualización del token
            throw error;
        }
    }

    return config
}

export function formatSession(jwtValue: string, cookie: Session) {
    const session = jwt.decode(jwtValue, "", true) as Session
    const sessionWithToken = {
        ...session,
        jwt: jwtValue,
        expirationDate: cookie.exp as number
    }
    return sessionWithToken
}

export default payloadClient;

payloadClient.interceptors.response.use(successInterceptor, failInterceptor);

payloadClient.interceptors.request.use(beforeSendInterceptor, failInterceptor);

