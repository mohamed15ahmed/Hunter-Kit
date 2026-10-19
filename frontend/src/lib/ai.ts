// Keep provider credentials on the backend; browser code never embeds API keys.
export const streamOpenChat = async (
  userInput: string,
  onMessage: (message: string) => void,
  onComplete: () => void,
  onError: (error: any) => void,
): Promise<void> => {
  try {
    const response = await window.electron.ipcRenderer.invoke('fetch-data', { userInput });
    onMessage(String(response?.result?.response || ''));
    onComplete();
  } catch (error) { onError(error); }
};
