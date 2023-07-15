import { PagoMovil, Zelle } from "../../payload-types";
import AccordionArrow from "../Accordion/AccordionArrow";

type AdminPaymentMethodsProps = {
    zelle: Zelle
    pagoMovil: PagoMovil;
}

export default function AdminPaymentMethods({ zelle, pagoMovil }: AdminPaymentMethodsProps) {
    return (
        <>
            <AccordionArrow title="Zelle" name="admin" content={
                <>
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-4">
                            <p className="text-sm md:text-base ">Email: {zelle.email}</p>
                            <p className="text-sm md:text-base ">Nombre: {zelle.zelleHolder}</p>
                            <p className="text-sm md:text-base ">Banco: {zelle.bank}</p>
                        </div>
                    </div>
                </>
            } />
            <AccordionArrow title="Pago Móvil" name="admin" content={
                <>
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-4">
                            <p className="text-sm md:text-base ">Cédula: {pagoMovil.cid}</p>
                            <p className="text-sm md:text-base ">Nombre: {pagoMovil.name}</p>
                            <p className="text-sm md:text-base ">Banco: {pagoMovil.bank}</p>
                            <p className="text-sm md:text-base ">Número: {pagoMovil.phone}</p>
                        </div>
                    </div>
                </>
            } />
        </>
    )
}