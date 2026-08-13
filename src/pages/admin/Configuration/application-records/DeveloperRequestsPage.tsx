import { useState } from "react";
import { Search, Filter, ChevronLeft, ChevronRight, Terminal, FileSearch } from "lucide-react";
import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import { PageContainer, PageHeader, EmptyState, Section, Toolbar, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";

// Tipo para los registros
type DeveloperRequest = {
  id: number;
  createdAt: string;
  requestUrl: string;
  method: string;
  statusCode: number;
};

// Datos de ejemplo - reemplaza con datos reales de tu API
const mockRequests: DeveloperRequest[] = [];

/** El código de respuesta manda el tono: 2xx correcto, 4xx aviso, 5xx fallo. */
function statusTone(code: number): "ok" | "warn" | "bad" | "neutral" {
  if (code >= 500) return "bad";
  if (code >= 400) return "warn";
  if (code >= 200 && code < 300) return "ok";
  return "neutral";
}

export default function DeveloperRequestsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState("25");
  const [currentPage, setCurrentPage] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Filtrar datos
  const filteredRequests = mockRequests.filter((request) => {
    const matchesSearch = request.requestUrl
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesMethod =
      methodFilter === "all" || request.method === methodFilter;
    const matchesStatus =
      statusFilter === "all" || request.statusCode.toString() === statusFilter;
    return matchesSearch && matchesMethod && matchesStatus;
  });

  const totalItems = filteredRequests.length;
  const totalPages = Math.ceil(totalItems / parseInt(itemsPerPage));
  const startIndex = (currentPage - 1) * parseInt(itemsPerPage);
  const endIndex = startIndex + parseInt(itemsPerPage);
  const currentItems = filteredRequests.slice(startIndex, endIndex);

  const handlePrevious = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNext = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  return (
    <AppLayout>
      <SettingsLayout
        navKey="configuracion"
        title="Registro de conexiones"
      >
        <PageContainer width="wide">
          <PageHeader
            icon={<Terminal />}
            title="Registro de conexiones"
            subtitle="Consulta las llamadas que tus sistemas han hecho a C-Guard Pro: fecha, dirección y resultado."
            badges={
              <StatusBadge tone="neutral" dot={false}>
                {totalItems} registro{totalItems === 1 ? "" : "s"}
              </StatusBadge>
            }
          />
          {/* Barra de búsqueda y filtros */}
          <Toolbar>
            <div className="relative min-w-[220px] flex-1">
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: "var(--ink-faint)" }}
              />
              <Input
                placeholder="Buscar por dirección…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9"
              />
            </div>

            <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="gap-2 whitespace-nowrap">
                  <Filter className="h-4 w-4" />
                  Filtros
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Filtros</SheetTitle>
                  <SheetDescription>
                    Afina la lista por tipo de llamada o resultado
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-6">
                  <div className="space-y-2">
                    <Label>Tipo de llamada</Label>
                    <Select value={methodFilter} onValueChange={setMethodFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="PUT">PUT</SelectItem>
                        <SelectItem value="DELETE">DELETE</SelectItem>
                        <SelectItem value="PATCH">PATCH</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Resultado</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar resultado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="200">200 · Correcto</SelectItem>
                        <SelectItem value="201">201 · Creado</SelectItem>
                        <SelectItem value="400">400 · Petición incorrecta</SelectItem>
                        <SelectItem value="401">401 · Sin autorización</SelectItem>
                        <SelectItem value="404">404 · No encontrado</SelectItem>
                        <SelectItem value="500">500 · Error del sistema</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setMethodFilter("all");
                        setStatusFilter("all");
                      }}
                    >
                      Limpiar
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => {
                        setFilterOpen(false);
                        setCurrentPage(1);
                      }}
                    >
                      Aplicar
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </Toolbar>

          {/* Tabla */}
          <Section title="Llamadas registradas" icon={<Terminal />} contentClassName="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold">Fecha</TableHead>
                  <TableHead className="font-semibold">Dirección</TableHead>
                  <TableHead className="font-semibold">Tipo</TableHead>
                  <TableHead className="font-semibold">Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-80 text-center">
                      <EmptyState
                        className="border-0 py-6"
                        icon={<FileSearch />}
                        title="Sin registros"
                        description="No hay ninguna llamada que coincida con lo que buscas."
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  currentItems.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="whitespace-nowrap text-xs" style={{ color: "var(--ink-soft)" }}>
                        {request.createdAt}
                      </TableCell>
                      <TableCell className="max-w-[320px] truncate font-mono text-xs" title={request.requestUrl}>
                        {request.requestUrl}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone="neutral" dot={false}>{request.method}</StatusBadge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={statusTone(request.statusCode)}>{request.statusCode}</StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Section>

          {/* Paginación */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: "var(--ink-soft)" }}>
                Elementos por página
              </span>
              <Select value={itemsPerPage} onValueChange={setItemsPerPage}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm tabular-nums" style={{ color: "var(--ink-soft)" }}>
                {totalItems === 0
                  ? "0 de 0"
                  : `${startIndex + 1}-${Math.min(endIndex, totalItems)} de ${totalItems}`}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePrevious}
                  disabled={currentPage === 1 || totalItems === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNext}
                  disabled={currentPage >= totalPages || totalItems === 0}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}