export default function DashboardPage() {
  return (
    <div className="p-8">
      <div className="max-w-4xl">
        <h1 className="text-3xl font-bold text-zinc-900 mb-4">
          Kanban System
        </h1>
        <p className="text-lg text-zinc-600 mb-8">
          Внутренняя корпоративная система для организации подразделений и управления задачами.
        </p>

        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-6">
          <p className="text-zinc-700">
            Добро пожаловать в рабочее пространство. Основные разделы (Задачи, Департаменты, Проекты) будут подключены позднее согласно плану разработки.
          </p>
        </div>
      </div>
    </div>
  );
}
