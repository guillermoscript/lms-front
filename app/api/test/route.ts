import { saveTest } from '@/actions/actions';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        // Your code here
        const body = await req.json()
        console.log(body)
        const { data, error } = await saveTest(body as any);

        if (error) {
            console.log(error);
            throw error;
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error(error);
        return NextResponse.error(error);
    }
}
