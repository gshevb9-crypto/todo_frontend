import axiosInstance from './axiosInstance';

export interface TabDto {
  id: string;
  title: string;
  icon?: string;
  orderIndex: number;
  createdAt: string;
  updatedAt?: string;
  imagesCount: number;
}

export interface TabImageDto {
  id: string;
  tabId: string;
  fileName: string;
  originalFileName: string;
  fileSize: number;
  contentType: string;
  url: string;
  createdAt: string;
}

export interface TabDetailDto {
  id: string;
  title: string;
  icon?: string;
  orderIndex: number;
  createdAt: string;
  updatedAt?: string;
  textContent: string;
  images: TabImageDto[];
}

export interface TabContentDto {
  tabId: string;
  textContent: string;
  updatedAt?: string;
}

export const getTabs = async (): Promise<TabDto[]> => {
  const { data } = await axiosInstance.get('/api/Tabs');
  return data?.data || data || [];
};

export const getTabById = async (id: string): Promise<TabDetailDto> => {
  const { data } = await axiosInstance.get(`/api/Tabs/${id}`);
  return data?.data || data;
};

export const createTab = async (title: string, icon: string = '📝', orderIndex: number = 0): Promise<TabDto> => {
  const { data } = await axiosInstance.post('/api/Tabs', { title, icon, orderIndex });
  return data?.data || data;
};

export const updateTab = async (id: string, title: string, icon?: string, orderIndex?: number): Promise<TabDto> => {
  const { data } = await axiosInstance.put(`/api/Tabs/${id}`, { title, icon, orderIndex });
  return data?.data || data;
};

export const deleteTab = async (id: string): Promise<void> => {
  await axiosInstance.delete(`/api/Tabs/${id}`);
};

export const updateTabContent = async (id: string, textContent: string): Promise<TabContentDto> => {
  const { data } = await axiosInstance.put(`/api/Tabs/${id}/content`, { textContent });
  return data?.data || data;
};
