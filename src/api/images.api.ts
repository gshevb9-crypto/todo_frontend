import axiosInstance from './axiosInstance';
import { TabImageDto } from './tabs.api';

export const uploadTabImage = async (tabId: string, file: File): Promise<TabImageDto> => {
  const formData = new FormData();
  formData.append('File', file);

  const { data } = await axiosInstance.post(`/api/TabImages/tabs/${tabId}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return data?.data || data;
};

export const replaceTabImage = async (imageId: string, file: File): Promise<TabImageDto> => {
  const formData = new FormData();
  formData.append('File', file);

  const { data } = await axiosInstance.put(`/api/TabImages/${imageId}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return data?.data || data;
};

export const deleteTabImage = async (imageId: string): Promise<void> => {
  await axiosInstance.delete(`/api/TabImages/${imageId}`);
};
