"use client";

import { useState } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { amountsEqual } from "@/lib/money";
import { monthlyBudgetSuffix } from "@/lib/budget-math";
import { createEnvelope, updateEnvelope, archiveEnvelope } from "@/actions/budgets";
import { Plus, Pencil, Archive } from "lucide-react";
import { toast } from "sonner";

interface Envelope {
  id: string;
  name: string;
  monthlyBudget: number | null;
  icon: string | null;
  color: string | null;
  isArchived: boolean;
  fillCadence: "WEEKLY" | "MONTHLY";
}

interface EnvelopeManagerProps {
  envelopes: Envelope[];
  pool: number;
  totalBudgets: number;
}

const CADENCE_OPTIONS = [
  { value: "WEEKLY", label: "Chaque semaine" },
  { value: "MONTHLY", label: "Une fois par mois" },
] as const;

function CadenceField({ idPrefix, defaultValue }: { idPrefix: string; defaultValue: "WEEKLY" | "MONTHLY" }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Remplissage</legend>
      <div className="grid grid-cols-2 gap-2">
        {CADENCE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            htmlFor={`${idPrefix}-cadence-${opt.value}`}
            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10 cursor-pointer"
          >
            <input
              id={`${idPrefix}-cadence-${opt.value}`}
              type="radio"
              name="fillCadence"
              value={opt.value}
              defaultChecked={defaultValue === opt.value}
              className="accent-primary"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function EnvelopeEditForm({
  envelope,
  onSubmit,
  onCancel,
}: {
  envelope: Envelope;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
}) {
  return (
    <form action={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Nom</Label>
        <Input name="name" defaultValue={envelope.name} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <MoneyInput
          name="monthlyBudget"
          label="Budget mensuel"
          defaultCents={Math.round(Number(envelope.monthlyBudget) * 100)}
        />
        <div className="space-y-2">
          <Label>Icône</Label>
          <Input name="icon" defaultValue={envelope.icon ?? ""} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Couleur</Label>
        <Input name="color" type="color" defaultValue={envelope.color ?? "#22c55e"} />
      </div>
      <CadenceField idPrefix={`edit-${envelope.id}`} defaultValue={envelope.fillCadence} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Annuler</Button>
        <Button type="submit">Enregistrer</Button>
      </div>
    </form>
  );
}

export function EnvelopeManager({ envelopes, pool, totalBudgets }: EnvelopeManagerProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const poolMismatch = !amountsEqual(totalBudgets, pool);
  const activeEnvelopes = envelopes.filter((e) => !e.isArchived);
  const editingEnvelope = envelopes.find((e) => e.id === editingId) ?? null;

  async function handleCreate(formData: FormData) {
    const result = await createEnvelope(formData);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Enveloppe créée");
    setCreateOpen(false);
  }

  async function handleUpdate(id: string, formData: FormData) {
    const result = await updateEnvelope(id, formData);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Enveloppe modifiée");
    setEditingId(null);
  }

  async function handleArchive(id: string) {
    const result = await archiveEnvelope(id);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Enveloppe archivée");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Enveloppes</CardTitle>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="size-4 mr-2" />
                Ajouter
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nouvelle enveloppe</DialogTitle>
              </DialogHeader>
              <form action={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="create-name">Nom</Label>
                  <Input id="create-name" name="name" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <MoneyInput
                    id="create-budget"
                    name="monthlyBudget"
                    label="Budget mensuel"
                  />
                  <div className="space-y-2">
                    <Label htmlFor="create-icon">Icône</Label>
                    <Input id="create-icon" name="icon" placeholder="🛒" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-color">Couleur</Label>
                  <Input id="create-color" name="color" type="color" defaultValue="#22c55e" />
                </div>
                <CadenceField idPrefix="create" defaultValue="WEEKLY" />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
                  <Button type="submit">Créer</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {poolMismatch && (
          // Neutral, not terracotta: terracotta means money out and nothing else (DESIGN.md).
          <div role="note" className="rounded-md border bg-muted p-3 text-sm text-foreground">
            Le total des budgets ({formatCurrency(totalBudgets)}) ne correspond pas au pool disponible ({formatCurrency(pool)}).
          </div>
        )}

        {/* Mobile card list */}
        <div className="space-y-3 md:hidden">
          {activeEnvelopes.map((env) => {
            const budget = Number(env.monthlyBudget);
            const weekly = budget * 12 / 52;
            return (
              <div key={env.id} className="rounded-xl border border-border/40 bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="truncate font-medium">
                    {env.icon} {env.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Modifier ${env.name}`}
                      onClick={() => setEditingId(env.id)}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Archiver ${env.name}`}
                        >
                          <Archive className="size-4 text-muted-foreground" aria-hidden="true" />
                        </Button>
                      }
                      title="Archiver cette enveloppe ?"
                      description={`L'enveloppe « ${env.name} » sera archivée et n'apparaîtra plus dans la liste active.`}
                      confirmLabel="Archiver"
                      onConfirm={() => handleArchive(env.id)}
                    />
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <span className="font-semibold">
                    {formatCurrency(budget)}
                    <span className="ml-1 text-[11px] text-muted-foreground">{monthlyBudgetSuffix(env.fillCadence)}</span>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatCurrency(weekly)}/sem.
                  </span>
                </div>
              </div>
            );
          })}
          {activeEnvelopes.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">Aucune enveloppe</p>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden rounded-md border md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Enveloppe</TableHead>
                <TableHead className="text-right">Budget mensuel</TableHead>
                <TableHead className="text-right">Hebdo indicatif</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeEnvelopes.map((env) => {
                const budget = Number(env.monthlyBudget);
                const weekly = budget * 12 / 52;
                return (
                  <TableRow key={env.id}>
                    <TableCell className="font-medium">
                      {env.icon} {env.name}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(budget)}
                      <span className="ml-1 text-[11px] text-muted-foreground">{monthlyBudgetSuffix(env.fillCadence)}</span>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatCurrency(weekly)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Modifier ${env.name}`}
                          onClick={() => setEditingId(env.id)}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </Button>
                        <ConfirmDialog
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Archiver ${env.name}`}
                            >
                              <Archive className="size-4 text-muted-foreground" aria-hidden="true" />
                            </Button>
                          }
                          title="Archiver cette enveloppe ?"
                          description={`L'enveloppe « ${env.name} » sera archivée et n'apparaîtra plus dans la liste active.`}
                          confirmLabel="Archiver"
                          onConfirm={() => handleArchive(env.id)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {activeEnvelopes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Aucune enveloppe
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-between text-sm font-medium">
          <span>Total budgets</span>
          <span>{formatCurrency(totalBudgets)}</span>
        </div>

        {envelopes.some((e) => e.isArchived) && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Archivées</p>
            <div className="flex flex-wrap gap-2">
              {envelopes.filter((e) => e.isArchived).map((env) => (
                <Badge key={env.id} variant="outline" className="opacity-50">
                  {env.icon} {env.name}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={editingId !== null} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l&apos;enveloppe</DialogTitle>
          </DialogHeader>
          {editingEnvelope && (
            <EnvelopeEditForm
              envelope={editingEnvelope}
              onSubmit={(fd) => handleUpdate(editingEnvelope.id, fd)}
              onCancel={() => setEditingId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
