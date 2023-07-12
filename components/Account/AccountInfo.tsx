import { User } from "../../payload-types"

type AccountInfoProps = {
    user: User
}

export default function AccountInfo({ user }: AccountInfoProps) {
    return (
        <div className="flex flex-col py-4 gap-3 text-left  w-full">
            <h3>
                {user.firstName} {user.lastName}
            </h3>
            <p>{user.email}</p>
            {/* {user.roles && <p>{user.roles.join(', ')}</p>} */}
            {user.createdAt && <p> Te registraste el {new Date(user.createdAt).toLocaleDateString()}</p>}
            {user.updatedAt && <p> Tu información fue actualizada el {new Date(user.updatedAt).toLocaleDateString()}</p>}
            {user.address && <p> Tu dirección es {user.address}</p>}
            {user.phone && <p> Tu teléfono es {user.phone}</p>}
            {user.birthDate && <p> Tu fecha de nacimiento es {new Date(user.birthDate).toLocaleDateString()}</p>}
        </div>
    )
}