import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateInvoiceHTML, getInvoiceConfig } from '@/lib/invoice-generator'

export async function GET(
  request: NextRequest,
  { params }: { params: { invoiceNumber: string } }
) {
  try {
    const supabase = await createClient()

    // Verify user is logged in
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    // Get payment request by invoice number
    const { data: paymentRequest, error: requestError } = await supabase
      .from('payment_requests')
      .select(`
        *,
        user:profiles!payment_requests_user_id_fkey(
          id,
          full_name,
          email
        ),
        product:products(
          name,
          description,
          price,
          currency
        )
      `)
      .eq('invoice_number', params.invoiceNumber)
      .single()

    if (requestError || !paymentRequest) {
      return new NextResponse('Invoice not found', { status: 404 })
    }

    // Verify user has access to this invoice (student or admin)
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)

    const isAdmin = roles?.some(r => r.role === 'admin')
    const isOwner = paymentRequest.user_id === user.id

    if (!isAdmin && !isOwner) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    // Generate invoice HTML
    const config = getInvoiceConfig()
    const html = generateInvoiceHTML({
      invoiceNumber: paymentRequest.invoice_number,
      invoiceDate: new Date(paymentRequest.invoice_generated_at || paymentRequest.created_at),
      dueDate: paymentRequest.payment_deadline ? new Date(paymentRequest.payment_deadline) : undefined,

      studentName: paymentRequest.contact_name,
      studentEmail: paymentRequest.contact_email,
      studentPhone: paymentRequest.contact_phone || undefined,

      productName: paymentRequest.product.name,
      productDescription: paymentRequest.product.description || undefined,
      price: paymentRequest.payment_amount,
      currency: paymentRequest.payment_currency,

      companyName: config.companyName,
      companyAddress: config.companyAddress,
      companyEmail: config.companyEmail,
      companyPhone: config.companyPhone,

      paymentMethod: paymentRequest.payment_method || undefined,
      paymentInstructions: paymentRequest.payment_instructions || undefined,

      notes: 'Please complete payment by the due date to maintain access to your courses.'
    })

    // Return HTML (can be converted to PDF with browser print or a library)
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    })

  } catch (error) {
    console.error('Invoice generation error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
