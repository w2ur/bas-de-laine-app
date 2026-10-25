"use client";

import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { exportHouseholdData, importHouseholdData } from "@/actions/backup";
import { DEMO_IMPORT_DISABLED } from "@/lib/demo/mode";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function BackupSection({ demo = false }: { demo?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingData, setPendingData] = useState<unknown>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setLoading(true);
    try {
      const data = await exportHouseholdData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().split("T")[0];
      const a = document.createElement("a");
      a.href = url;
      a.download = `bas-de-laine-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Sauvegarde exportée avec succès");
    } catch {
      toast.error("Erreur lors de l'exportation");
    } finally {
      setLoading(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".json")) {
      toast.error("Le fichier doit être au format .json");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error("Le fichier ne doit pas dépasser 10 Mo");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        setPendingData(parsed);
        setConfirmOpen(true);
      } catch {
        toast.error("Le fichier JSON est invalide");
      }
    };
    reader.readAsText(file);

    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleRestore() {
    setConfirmOpen(false);
    setLoading(true);
    try {
      const result = await importHouseholdData(pendingData);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Données restaurées avec succès");
      }
    } catch {
      toast.error("Erreur lors de la restauration");
    } finally {
      setLoading(false);
      setPendingData(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sauvegarde et restauration</CardTitle>
      </CardHeader>
      <CardContent className="flex gap-4">
        {/* Outlined: « Enregistrer » (income) is the screen's one filled action (DESIGN.md). */}
        <Button variant="outline" onClick={handleExport} disabled={loading}>
          <Download className="mr-2 size-4" />
          Exporter
        </Button>
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading || demo}
        >
          <Upload className="mr-2 size-4" />
          Importer
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileSelect}
        />
      </CardContent>
      {demo && (
        <CardContent>
          <p className="text-sm text-muted-foreground">{DEMO_IMPORT_DISABLED}</p>
        </CardContent>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurer les données ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action va effacer toutes vos données actuelles et les remplacer par celles du
              fichier de sauvegarde. Cette opération est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleRestore}>
              Restaurer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
