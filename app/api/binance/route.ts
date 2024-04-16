import crypto from 'crypto';
import axios from 'axios';
import { cookies } from 'next/headers'
import { type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'

interface BinanceOrderResponse {
    status: string
    code: string
    data: BinanceOrderData
    errorMessage: string
}

interface BinanceOrderData {
    prepayId: string
    terminalType: string
    expireTime: number
    qrcodeLink: string
    qrContent: string
    checkoutUrl: string
    deeplink: string
    universalUrl: string
    totalFee: string
    currency: string
}



async function createOrder(payload: any, secretKey: string) {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    const requestBody = {
        ...payload,
        env: {
            terminalType: 'WEB'
        },
    };
    const signature = crypto.createHmac('sha512', secretKey)
        .update(`${timestamp}\n${nonce}\n${JSON.stringify(requestBody)}\n`)
        .digest('hex')
        .toUpperCase();
    const headers = {
        'Content-Type': 'application/json',
        'BinancePay-Timestamp': timestamp,
        'BinancePay-Nonce': nonce,
        'BinancePay-Certificate-SN': process.env.BINANCE_API_KEY,
        'BinancePay-Signature': signature
    };
    
    try {
        const response = await axios.post('https://bpay.binanceapi.com/binancepay/openapi/v3/order', requestBody, { headers });
        return response.data;
    } catch (error) {
        console.log(error, '<----------- error');
        throw error;
    }
}

export async function POST(req: NextRequest) {
    const body = await req.json() // res now contains body

    console.log(body, '<----------- body')

    const { productId } = body

    console.log(body, '<----------- body')

    const cookieStore = cookies()
    const supabase = createClient(cookieStore)

    // Check if we have a session
    const {
        data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
        return new Response('Unauthorized', { status: 401 })
    }


    if (!productId) {
        return new Response('Missing product ID', { status: 400 })
    }

    const fullUser = await supabase.auth.getUser()

    if (!fullUser) {
        return new Response('Unauthorized', { status: 401 })
    }

    console.log(fullUser)

    const profile = await supabase
        .from('profiles')
        .select('*')
        .eq('id', fullUser?.data.user?.id)
        .single()

    try {

        const productData = await supabase.from('products').select(`*, products_pricing ( id, price, currency ( code, id ) )`).eq('id', productId).single()

        console.log(productData, '<----------- productData')

        // console.log(total, '<----------- total')


        const invoice = await supabase.from('invoices').insert({
            customer_id: fullUser?.data.user?.id,
            status: 'pending',
            country: 'US',
            currency: productData.data?.products_pricing[0].currency?.id,
            due_date: dayjs().add(1, 'week').toDate(),
        }).select('*').single()

        console.log(invoice, '<----------- invoice')

        const invoiceLineItem = await supabase.from('invoice_line_items').insert({
            invoice_id: invoice.data?.id,
            product_id: productId,
            quantity: 1,
            line_amount: productData.data?.products_pricing[0].price,
        }).single()

        console.log(invoiceLineItem, '<----------- invoiceLineItem')

        const bodyToSend = {
            "merchantTradeNo": invoice.data?.id,
            "orderAmount": 0.1, // for now we are using a fixed amount, but this should change to the actual amount
            "currency": "USDT",
            "buyer": {
                "buyerEmail": fullUser.data.user?.email,
                "buyerName": {
                    "firstName": profile?.data?.full_name?.split(' ')[0],
                    "lastName": profile?.data?.full_name?.split(' ')[1]
                },
            },
            "description": `Payment for ${productData.data?.name}`,
            "webhookUrl": "",
            "goodsDetails": [{
                "goodsType": "02",
                "goodsCategory": "Z000",
                "referenceGoodsId": productId,
                "goodsName": productData.data?.name,
                "goodsDetail": productData.data?.description,
            }]
        };
    
        // const bodyToSend = {
        //     "merchantTradeNo": "545454537292", "orderAmount": 25.17, "currency": "USDT", "description": "very good Ice Cream", "goodsDetails": [{ "goodsType": "01", "goodsCategory": "D000", "referenceGoodsId": "7876763A3B", "goodsName": "Ice Cream", "goodsDetail": "Greentea ice cream cone" }]
        // }
        
        const secretKey = process.env.BINANCE_API_KEY_SECRET || '';
        
        const order: BinanceOrderResponse = await createOrder(bodyToSend, secretKey)
        if (order.status === 'SUCCESS') {
            
            return new Response(
                JSON.stringify({
                    ...order,
                    url: order.data.checkoutUrl,
                }),
                {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            )
        }

    } catch (e) {
        console.log(e, '<----------- e')
        return new Response('Internal server error', { status: 500 })
    }
}
