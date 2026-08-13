import { FileBarChart } from 'lucide-react'
import SettingsPageShell from '../components/SettingsPageShell'
import ReportSettingsForm from './ReportSettingsForm'

const ReportSettingsPage = () => {
    return (
        <SettingsPageShell
            icon={<FileBarChart />}
            title="Configuración de Informes"
            subtitle="Controla la privacidad, el encabezado y el pie de página de los informes exportados."
        >
            <ReportSettingsForm />
        </SettingsPageShell>
    )
}

export default ReportSettingsPage
