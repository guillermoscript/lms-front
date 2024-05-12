import { saveTest } from '@/actions/dashboard/testActions';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        // Your code here
        const body = await req.json()
        console.log(body)
        const { data, error } = await saveTest(body as any);

        if (error) {
            console.log(error);
            return NextResponse.error(error);
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error(error);
        return NextResponse.error(error);
    }
}

export async function PUT(req: Request) {
    try {
        // Your code here
        const body = await req.json()
        // get id from query
        const id = req.url.split('/').pop()

        console.log(body)
        
    } catch (error) {
        console.error(error);
        return NextResponse.error(error);
    }
}