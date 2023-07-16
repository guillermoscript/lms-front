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
                            <p className="text-sm md:text-base ">Email del beneficiario: {zelle.email}</p>
                            <p className="text-sm md:text-base ">Nombre del beneficiario: {zelle.zelleHolder}</p>
                            <p className="text-sm md:text-base ">Banco del beneficiario: {zelle.bank}</p>
                        </div>
                    </div>
                </>
            } />
            <AccordionArrow title="Pago Móvil" name="admin" content={
                <>
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-4">
                            <p className="text-sm md:text-base ">Cédula o RIF del beneficiario: {pagoMovil.cid}</p>
                            <p className="text-sm md:text-base ">Nombre del beneficiario: {pagoMovil.name}</p>
                            <p className="text-sm md:text-base ">Banco del beneficiario: {pagoMovil.bank}</p>
                            <p className="text-sm md:text-base ">Número de teléfono del beneficiario: {pagoMovil.phone}</p>
                        </div>
                    </div>
                </>
            } />
        </>
    )
}