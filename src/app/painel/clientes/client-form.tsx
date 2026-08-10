"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import { createClient, updateClient } from "@/lib/clients/actions";
import type { ClientDetail } from "@/lib/clients/queries";

function maskCpf(raw: string) {
  let v = raw.replace(/\D/g, "").substring(0, 11);
  if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
  else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
  else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, "$1.$2");
  return v;
}

function maskCep(raw: string) {
  let v = raw.replace(/\D/g, "").substring(0, 8);
  if (v.length > 5) v = v.replace(/(\d{5})(\d{1,3})/, "$1-$2");
  return v;
}

function formatDt(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  initial?: ClientDetail | null;
};

export function ClientForm({ initial }: Props) {
  const router = useRouter();
  const isEdit = Boolean(initial?.id);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cepLoading, setCepLoading] = useState(false);

  const [nome, setNome] = useState(initial?.name ?? "");
  const [cpf, setCpf] = useState(initial?.cpf ?? "");
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [cep, setCep] = useState(initial?.cep ?? "");
  const [logradouro, setLogradouro] = useState(initial?.street ?? "");
  const [numero, setNumero] = useState(initial?.number ?? "");
  const [complemento, setComplemento] = useState(initial?.complement ?? "");
  const [bairro, setBairro] = useState(initial?.district ?? "");
  const [cidade, setCidade] = useState(initial?.city ?? "");
  const [estado, setEstado] = useState(initial?.state ?? "");
  const [observacoes, setObservacoes] = useState(initial?.notes ?? "");

  async function buscarCep() {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = (await res.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (data.erro) {
        setError("CEP não encontrado.");
        return;
      }
      setError(null);
      if (data.logradouro) setLogradouro(data.logradouro);
      if (data.bairro) setBairro(data.bairro);
      if (data.localidade) setCidade(data.localidade);
      if (data.uf) setEstado(data.uf);
    } catch {
      setError("Falha ao consultar o CEP.");
    } finally {
      setCepLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      nome,
      cpf: cpf || null,
      whatsapp: whatsapp || null,
      email: email || null,
      cep: cep || null,
      logradouro: logradouro || null,
      numero: numero || null,
      complemento: complemento || null,
      bairro: bairro || null,
      cidade: cidade || null,
      estado: estado || null,
      observacoes: observacoes || null,
    };

    start(async () => {
      const result = isEdit
        ? await updateClient(initial!.id, payload)
        : await createClient(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/painel/clientes");
      router.refresh();
    });
  }

  return (
    <div className="clientes-page">
      <div className="page-header">
        <div>
          <h4>{isEdit ? "Editar Cliente" : "Novo Cliente"}</h4>
          <p className="breadcrumb">
            <Link href="/painel/clientes">Clientes</Link>
            {" / "}
            {isEdit ? "Editar" : "Novo"}
          </p>
        </div>
        <Link href="/painel/clientes" className="btn-outline">
          Voltar
        </Link>
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      <form onSubmit={onSubmit}>
        <div className="grid-2">
          <div>
            <div className="card" style={{ marginBottom: "1rem" }}>
              <div className="card-header">
                <span className="card-title-icon">●</span> Dados Pessoais
              </div>
              <div className="card-body">
                <div className="row-g row-nome-cpf">
                  <div>
                    <label className="form-label">
                      Nome Completo <span className="required-star">*</span>
                    </label>
                    <input
                      className="form-control"
                      required
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Nome completo do cliente"
                    />
                  </div>
                  <div>
                    <label className="form-label">CPF</label>
                    <input
                      className="form-control"
                      value={cpf}
                      maxLength={14}
                      onChange={(e) => setCpf(maskCpf(e.target.value))}
                      placeholder="000.000.000-00"
                    />
                  </div>
                  <div>
                    <label className="form-label">WhatsApp</label>
                    <div className="input-group">
                      <span className="input-group-text">WA</span>
                      <input
                        className="form-control has-prefix"
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(e.target.value)}
                        placeholder="(11) 99999-9999"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="form-label">E-mail</label>
                    <div className="input-group">
                      <span className="input-group-text">@</span>
                      <input
                        type="email"
                        className="form-control has-prefix"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="email@exemplo.com"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title-icon">●</span> Endereço (para envio
                pelos Correios)
              </div>
              <div className="card-body">
                <div className="row-g">
                  <div className="row-g row-cep-log">
                    <div>
                      <label className="form-label">CEP</label>
                      <div className="input-group">
                        <input
                          className="form-control"
                          style={{ borderRadius: "6px 0 0 6px" }}
                          value={cep}
                          maxLength={9}
                          onChange={(e) => setCep(maskCep(e.target.value))}
                          onBlur={() => void buscarCep()}
                          placeholder="00000-000"
                        />
                        <button
                          type="button"
                          className="btn-cep"
                          disabled={cepLoading}
                          onClick={() => void buscarCep()}
                        >
                          {cepLoading ? "…" : "Buscar"}
                        </button>
                      </div>
                      <div className="form-text">
                        Preencha o CEP para auto-completar o endereço.
                      </div>
                    </div>
                    <div>
                      <label className="form-label">Logradouro</label>
                      <input
                        className="form-control"
                        value={logradouro}
                        onChange={(e) => setLogradouro(e.target.value)}
                        placeholder="Rua, Avenida, etc."
                      />
                    </div>
                  </div>
                  <div className="row-g row-num-comp-bai">
                    <div>
                      <label className="form-label">Número</label>
                      <input
                        className="form-control"
                        value={numero}
                        onChange={(e) => setNumero(e.target.value)}
                        placeholder="123"
                      />
                    </div>
                    <div>
                      <label className="form-label">Complemento</label>
                      <input
                        className="form-control"
                        value={complemento}
                        onChange={(e) => setComplemento(e.target.value)}
                        placeholder="Apto, Bloco…"
                      />
                    </div>
                    <div>
                      <label className="form-label">Bairro</label>
                      <input
                        className="form-control"
                        value={bairro}
                        onChange={(e) => setBairro(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="row-g row-cid-uf">
                    <div>
                      <label className="form-label">Cidade</label>
                      <input
                        className="form-control"
                        value={cidade}
                        onChange={(e) => setCidade(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label">UF</label>
                      <input
                        className="form-control"
                        value={estado}
                        maxLength={2}
                        style={{ textTransform: "uppercase" }}
                        onChange={(e) =>
                          setEstado(e.target.value.toUpperCase())
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="card">
              <div className="card-header">
                <span className="card-title-icon">●</span> Observações
              </div>
              <div className="card-body">
                <textarea
                  className="form-control"
                  rows={5}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Anotações sobre o cliente…"
                />
              </div>
            </div>

            {isEdit && initial ? (
              <div className="card" style={{ marginTop: "1rem" }}>
                <div className="card-body">
                  <div className="meta-row">
                    <span className="text-muted" style={{ color: "var(--muted)" }}>
                      Cadastrado em
                    </span>
                    <strong>{formatDt(initial.createdAt)}</strong>
                  </div>
                  <div className="meta-row">
                    <span style={{ color: "var(--muted)" }}>Atualizado em</span>
                    <strong>{formatDt(initial.updatedAt)}</strong>
                  </div>
                  <hr
                    style={{
                      margin: "0.75rem 0",
                      border: "none",
                      borderTop: "1px solid var(--line)",
                    }}
                  />
                  <Link
                    href={`/painel/clientes/${initial.id}`}
                    className="btn-outline"
                    style={{ width: "100%", justifyContent: "center" }}
                  >
                    Ver histórico de pedidos
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-accent" disabled={pending}>
            {pending
              ? "Salvando…"
              : isEdit
                ? "Salvar Alterações"
                : "Cadastrar Cliente"}
          </button>
          <Link href="/painel/clientes" className="btn-outline">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
