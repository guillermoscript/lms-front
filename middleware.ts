import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';


const UserRoles = {
    COMPANY_USER: "company_user",
    FINANCIAL_USER: "organization_user",
    PUBLIC_BODY_USER: "public_body_user",
    ADMIN: "admin"
};

const rolePath = {
    [UserRoles.COMPANY_USER]: "dashboard/company",
    [UserRoles.FINANCIAL_USER]: "dashboard/financial-institutions",
    [UserRoles.PUBLIC_BODY_USER]: "dashboard/public-user",
    [UserRoles.ADMIN]: "dashboard/admin/user-dashboard"
}


export function middleware(request: NextRequest) {
    // Assume a "Cookie:nextjs=fast" header to be present on the incoming request
    // Getting cookies from the request using the `RequestCookies` API
    
    return NextResponse.next();
}