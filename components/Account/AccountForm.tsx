import { SubmitHandler, useForm } from 'react-hook-form';
import InputGroup, { InputGroupProps } from '../Inputs/InputGroup';
import { useCallback, useState } from 'react';
import { useAuth } from '../Auth';
import { User } from '../../payload-types';
import { apiUrl } from '../../utils/env';
import payloadClient from '../../utils/axiosPayloadInstance';
import { DaisyUiAlert } from '../Alert/DaisyUiAlerts';
import { LoadSpinner } from '../Loaders/DaisyUiLoaders';
import { useMutation } from '@tanstack/react-query';

const classNames = {
  container: 'relative w-full mb-3',
  label: 'block uppercase text-xs font-bold mb-2',
  input:
    'input input-bordered border-0 px-3 py-3 rounded text-sm shadow focus:outline-none focus:ring w-full ease-linear transition-all duration-150 focus:ring-primary-content',
};
const userInfo = (register: any, errors: any) =>
  [
    {
      name: 'firstName',
      label: 'Nombre',
      type: 'text',
      classNames,
      register: register('firstName'),
      validations: {
        required: {
          value: true,
          message: 'El nombre es requerido'
        }
      },
      errors,
    },
    {
      name: 'lastName',
      label: 'Apellido',
      type: 'text',
      classNames,
      register: register('lastName'),
      validations: {
        required: {
          value: true,
          message: 'El apellido es requerido'
        }
      },
      errors,
    },
    {
      name: 'phone',
      label: 'Teléfono',
      type: 'tel',
      classNames,
      register: register('phone'),
      validations: {
        required: {
          value: true,
          message: 'El teléfono es requerido'
        }
      },
      errors,
    }
  ]

type AccountFormProps = {
  user: User;
};

const patchUser = async (data: any) => {
  const res = await payloadClient.patch(`/api/users/${data.id}`, data);
  return res.data;
}

const addImage = async (data: any) => {
  
  const res = await payloadClient.post("/api/medias",data, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  return res.data;
}



export default function AccountForm({ user }: AccountFormProps) {
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    mode: 'all',
  });

  const { setUser } = useAuth();
  const inputs = userInfo(register, errors);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const photoMutation = useMutation({
    mutationFn: addImage,
  });

  const mutation = useMutation({
    mutationFn: patchUser,
    
      onSuccess: (data) => {
        // Update the user in auth state with new values
        setUser(data);
      },
      onError: (error) => {
        console.log(error)
      }
    
  });

  const onSubmit = (data: any) => {
    
    console.log(data, 'data')
    if (data.photo.length === 0) {

      console.log(data, 'as')
      delete data.photo;
      mutation.mutate({
        ...data,
        id: user.id
      });
      
    } else {
      console.log(data, 'sssssss')
      const formData = new FormData();
      formData.append("file", data.photo[0]);
      formData.append("filename", data.photo[0].name);
      formData.append("altText", `photo-${data.photo[0].name}`);
      console.log(formData, 'formdata')
      photoMutation.mutate(formData, {
        onSuccess: (response) => {
          mutation.mutate({
            ...data,
            id: user.id,
            photo: response.doc.id
          });
        }
      });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

      <h6 className="text-blueGray-400 text-sm mt-3 mb-6 font-bold uppercase">Tu información</h6>

      {inputs.map((input) => (
        <div className={classNames.container} key={input.name}>
        <label htmlFor={input.name} className={classNames.label}>
          {input.label}
        </label>
        <input type={input.type} id={input.name} className={classNames.input} {...register(input.name, input.validations)} />
        {
          errors[input.name] && (
            <div className="text-error text-sm mt-1">
              Este campo es requerido
            </div>
          )
        }
      </div>
      ))}

      <div className={classNames.container}>
        <label className={classNames.label} htmlFor="photo">
          Foto
        </label>
        <input
          {...register('photo')}
          type="file"
          className="file-input file-input-bordered w-full max-w-xs"
          placeholder="Foto"
          // defaultValue={user.photo}
        />
      </div>

      <button
        disabled={mutation.isPending || photoMutation.isPending}
        className='btn btn-accent' type="submit">
          {mutation.isPending ? 'Guardando...' : 'Guardar'}
      </button>
      {mutation.isPending || photoMutation.isPending && (
          <div className="flex justify-center mt-4">
            <LoadSpinner size='lg'  />
          </div>
      )}
      {mutation.isSuccess && (
        <div className="flex justify-center mt-4">
          <DaisyUiAlert type="success" message="Usuario actualizado" />
        </div>
      )}
      {mutation.isError || photoMutation.isError && (
        <div className="flex justify-center mt-4">
          <DaisyUiAlert type="error" message="Error al actualizar usuario" />
        </div>
      )}
    </form>
  );
}
