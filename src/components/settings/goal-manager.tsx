"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreateGoalDialog } from "@/components/envelopes/create-goal-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { updateGoalEnvelope } from "@/actions/goals";
import { archiveEnvelope } from "@/actions/budgets";
import { Plus, Pencil, Archive, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface GoalEnvelope {
  id: string;
  name: string;
  targetAmount: number | null;
  targetDate: Date | null;
  icon: string | null;
  color: string | null;
  isArchived: boolean;
}

interface GoalManagerProps {
  goals: GoalEnvelope[];
}

function formatTargetDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric" }).format(
    new Date(date)
  );
}

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}

function GoalEditForm({
  goal,
  onSubmit,
  onCancel,
  isPending,
}: {
  goal: GoalEnvelope;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <form action={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Nom</Label>
        <Input name="name" defaultValue={goal.name} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <MoneyInput
          name="targetAmount"
          label="Montant cible"
          defaultCents={
            goal.targetAmount != null ? Math.round(Number(goal.targetAmount) * 100) : 0
          }
          required
        />
        <div className="space-y-2">
          <Label>Icône</Label>
          <Input name="icon" defaultValue={goal.icon ?? ""} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Date cible</Label>
          <Input
            name="targetDate"
            type="date"
            defaultValue={toDateInputValue(goal.targetDate)}
          />
        </div>
        <div className="space-y-2">
          <Label>Couleur</Label>
          <Input name="color" type="color" defaultValue={goal.color ?? "#448061"} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}

export function GoalManager({ goals }: GoalManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isUpdatePending, startUpdateTransition] = useTransition();

  const activeGoals = goals.filter((g) => !g.isArchived);
  const editingGoal = goals.find((g) => g.id === editingId) ?? null;

  function handleUpdate(id: string, formData: FormData) {
    startUpdateTransition(async () => {
      const result = await updateGoalEnvelope(id, formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Objectif modifié");
      setEditingId(null);
    });
  }

  async function handleArchive(id: string) {
    const result = await archiveEnvelope(id);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Objectif archivé");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Objectifs</CardTitle>
          <CreateGoalDialog
            trigger={
              <Button size="sm" variant="outline">
                <Plus className="size-4 mr-2" />
                Ajouter
              </Button>
            }
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mobile card list */}
        <div className="space-y-3 md:hidden">
          {activeGoals.map((goal) => {
            const target = goal.targetAmount != null ? Number(goal.targetAmount) : 0;
            return (
              <div
                key={goal.id}
                className="rounded-xl border border-border/40 bg-card p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="truncate font-medium">
                    {goal.icon} {goal.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Modifier ${goal.name}`}
                      onClick={() => setEditingId(goal.id)}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Archiver ${goal.name}`}
                        >
                          <Archive className="size-4 text-muted-foreground" aria-hidden="true" />
                        </Button>
                      }
                      title="Archiver cet objectif ?"
                      description={`L'objectif « ${goal.name} » sera archivé et n'apparaîtra plus dans la liste active.`}
                      confirmLabel="Archiver"
                      onConfirm={() => handleArchive(goal.id)}
                    />
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <span className="font-semibold">{formatCurrency(target)}</span>
                  {goal.targetDate && (
                    <span className="text-sm text-muted-foreground">
                      {formatTargetDate(goal.targetDate)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {activeGoals.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Aucun objectif
            </p>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden rounded-md border md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Objectif</TableHead>
                <TableHead className="text-right">Montant cible</TableHead>
                <TableHead className="text-right">Date cible</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeGoals.map((goal) => {
                const target = goal.targetAmount != null ? Number(goal.targetAmount) : 0;
                return (
                  <TableRow key={goal.id}>
                    <TableCell className="font-medium">
                      {goal.icon} {goal.name}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(target)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatTargetDate(goal.targetDate)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Modifier ${goal.name}`}
                          onClick={() => setEditingId(goal.id)}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </Button>
                        <ConfirmDialog
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Archiver ${goal.name}`}
                            >
                              <Archive className="size-4 text-muted-foreground" aria-hidden="true" />
                            </Button>
                          }
                          title="Archiver cet objectif ?"
                          description={`L'objectif « ${goal.name} » sera archivé et n'apparaîtra plus dans la liste active.`}
                          confirmLabel="Archiver"
                          onConfirm={() => handleArchive(goal.id)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {activeGoals.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground"
                  >
                    Aucun objectif
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {goals.some((g) => g.isArchived) && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Archivés</p>
            <div className="flex flex-wrap gap-2">
              {goals
                .filter((g) => g.isArchived)
                .map((goal) => (
                  <Badge key={goal.id} variant="outline" className="opacity-50">
                    {goal.icon} {goal.name}
                  </Badge>
                ))}
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={editingId !== null} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l&apos;objectif</DialogTitle>
          </DialogHeader>
          {editingGoal && (
            <GoalEditForm
              goal={editingGoal}
              onSubmit={(fd) => handleUpdate(editingGoal.id, fd)}
              onCancel={() => setEditingId(null)}
              isPending={isUpdatePending}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
