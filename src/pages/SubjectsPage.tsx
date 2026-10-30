import { useState, useCallback } from 'react';
import { subjectRepo, tombstoneRepo } from '../services/repositories';
import { useSyncRefresh } from '../hooks/useServerSync';
import type { Subject } from '../types';
import { SubjectsDesktop } from '../components/subjects/SubjectsDesktop';
import { SubjectForm } from '../components/subjects/SubjectForm';
import { SubjectList } from '../components/mobile/SubjectList';
import { useIsMobile } from '../hooks/useIsMobile';

export function SubjectsPage() {
  const isMobile = useIsMobile();
  const [subjects, setSubjects] = useState<Subject[]>(subjectRepo.getAll());
  const [showForm, setShowForm] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);

  // Bumped on every change, so the desktop page re-reads events and tasks too.
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => {
    setSubjects(subjectRepo.getAll());
    setVersion((v) => v + 1);
  }, []);

  useSyncRefresh(refresh);

  const handleAdd = useCallback(() => {
    setEditingSubject(null);
    setShowForm(true);
  }, []);

  const handleEdit = useCallback((subject: Subject) => {
    setEditingSubject(subject);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback((id: string) => {
    tombstoneRepo.add('subjects', id);
    subjectRepo.delete(id);
    setShowForm(false);
    setEditingSubject(null);
    refresh();
  }, [refresh]);

  const handleSave = useCallback(
    (data: { name: string; color: string; weeklyGoalMinutes: number | null }) => {
      if (editingSubject) {
        subjectRepo.update(editingSubject.id, data);
      } else {
        subjectRepo.create({ ...data, progress: 0 });
      }
      setShowForm(false);
      setEditingSubject(null);
      refresh();
    },
    [editingSubject, refresh]
  );

  const handleCancel = useCallback(() => {
    setShowForm(false);
    setEditingSubject(null);
  }, []);

  const form = showForm && (
    <SubjectForm subject={editingSubject} onSave={handleSave} onCancel={handleCancel} onDelete={handleDelete} />
  );

  if (isMobile) {
    return (
      <div className="flex flex-col w-full flex-1 min-h-0 relative overflow-hidden">
        <SubjectList subjects={subjects} onEdit={handleEdit} onAdd={handleAdd} />
        {form}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full">
      <SubjectsDesktop subjects={subjects} version={version} onAdd={handleAdd} onEdit={handleEdit} onDelete={handleDelete} />
      {form}
    </div>
  );
}
