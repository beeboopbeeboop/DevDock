import { useQuery } from '@tanstack/react-query';

interface PortStatus {
  port: number;
  running: boolean;
}

interface PortInfo {
  port: number;
  process: { command: string; pid: number; user: string } | null;
}

export function usePortStatusBatch(ports: number[]) {
  const validPorts = ports.filter((p) => p > 0);

  return useQuery<PortStatus[]>({
    queryKey: ['port-status', validPorts.join(',')],
    queryFn: async () => {
      if (validPorts.length === 0) return [];
      const res = await fetch(`/api/actions/port-check-batch?ports=${validPorts.join(',')}`);
      return res.json();
    },
    refetchInterval: 8000, // Poll every 8s
    enabled: validPorts.length > 0,
  });
}

export function usePortStatus(port: number | null) {
  return useQuery<PortStatus>({
    queryKey: ['port-status-single', port],
    queryFn: async () => {
      const res = await fetch(`/api/actions/port-check/${port}`);
      return res.json();
    },
    refetchInterval: 5000,
    enabled: !!port && port > 0,
  });
}

export function usePortInfo(port: number | null) {
  return useQuery<PortInfo>({
    queryKey: ['port-info', port],
    queryFn: async () => {
      const res = await fetch(`/api/actions/port-info/${port}`);
      return res.json();
    },
    enabled: !!port && port > 0,
  });
}
