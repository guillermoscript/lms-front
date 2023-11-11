import DashboardLayout from '../../components/Dashboard/DashboardLayout';
import { useState } from 'react';
import { apiUrl } from '../../utils/env';
import payloadClient from '../../utils/axiosPayloadInstance';
import { useMutation } from '@tanstack/react-query';

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);

  const uploadFile = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await payloadClient.post(apiUrl + '/api/files/upload', formData, {
          withCredentials: true,
          headers: {
              'Content-Type': 'multipart/form-data',
          },
      });
      return response.data;
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      uploadFile.mutate(formData);
    }
  };

  return (
    <DashboardLayout>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="file">Choose a file:</label>
          <input type="file" id="file" name="audio" onChange={handleFileChange} />
        </div>
        <button type="submit" disabled={!file || uploadFile.isPending}>
          {uploadFile.isPending ? 'Uploading...' : 'Upload'}
        </button>
      </form>
    </DashboardLayout>
  );
}
